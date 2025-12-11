import {
  Button,
  buttonVariant,
  ToastContext,
  ToastType,
} from "@humansignal/ui";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { generatePath, useHistory } from "react-router";
import { Link, NavLink } from "react-router-dom";
import { Spinner } from "../../components";
import { modal } from "../../components/Modal/Modal";
import { Space } from "../../components/Space/Space";
import { useAPI } from "../../providers/ApiProvider";
import { useProject } from "../../providers/ProjectProvider";
import { useToolRunning } from "../../providers/ToolRunningProvider";
import { useContextProps, useParams } from "../../providers/RoutesProvider";
import { addCrumb, deleteCrumb } from "../../services/breadrumbs";
import { Block, Elem } from "../../utils/bem";
import { isDefined } from "../../utils/helpers";
import { ImportModal } from "../CreateProject/Import/ImportModal";
import { ExportPage } from "../ExportPage/ExportPage";
import { APIConfig } from "./api-config";

import "./DataManager.scss";

const loadDependencies = () => [
  import("@humansignal/datamanager"),
  import("@humansignal/editor"),
];

const initializeDataManager = async (root, props, params) => {
  if (!window.LabelStudio)
    throw Error("Label Studio Frontend doesn't exist on the page");
  if (!root && root.dataset.dmInitialized) return;

  root.dataset.dmInitialized = true;

  const { ...settings } = root.dataset;

  const dmConfig = {
    root,
    projectId: params.id,
    apiGateway: `${window.APP_SETTINGS.hostname}/api/dm`,
    apiVersion: 2,
    project: params.project,
    polling: window.APP_SETTINGS?.polling,
    showPreviews: false,
    apiEndpoints: APIConfig.endpoints,
    interfaces: {
      import: true,
      export: true,
      backButton: false,
      labelingHeader: false,
      autoAnnotation: params.autoAnnotation,
    },
    labelStudio: {
      keymap: window.APP_SETTINGS.editor_keymap,
    },
    ...props,
    ...settings,
  };

  return new window.DataManager(dmConfig);
};

const buildLink = (path, params) => {
  return generatePath(`/projects/:id${path}`, params);
};

// Hàm chuyển đổi HEX sang RGBA để làm màu nền nhạt
// Ví dụ: hexToRgba("#FF0000", 0.1) -> "rgba(255, 0, 0, 0.1)"
const hexToRgba = (hex, alpha = 0.2) => {
  let c;
  if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
    c = hex.substring(1).split("");
    if (c.length === 3) {
      c = [c[0], c[0], c[1], c[1], c[2], c[2]];
    }
    c = "0x" + c.join("");
    return (
      "rgba(" +
      [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(",") +
      "," +
      alpha +
      ")"
    );
  }
  return hex; // Trả về nguyên gốc nếu không phải hex
};

export const DataManagerPage = ({ ...props }) => {
  const dependencies = useMemo(loadDependencies, []);
  const toast = useContext(ToastContext);
  const root = useRef();
  const params = useParams();
  const history = useHistory();
  const api = useAPI();
  const { project } = useProject();
  const { isToolRunning, getRunningToolsCount } = useToolRunning();
  const setContextProps = useContextProps();
  const [crashed, setCrashed] = useState(false);
  const [loading, setLoading] = useState(
    !window.DataManager || !window.LabelStudio
  );
  const [runningToolName, setRunningToolName] = useState(null);
  const dataManagerRef = useRef();
  const projectId = project?.id;
  const hasRunningTools = project?.id ? isToolRunning(project.id) : false;
  const runningCount = project?.id ? getRunningToolsCount(project.id) : 0;

  const init = useCallback(async () => {
    if (!window.LabelStudio) return;
    if (!window.DataManager) return;
    if (!root.current) return;
    if (!project?.id) return;
    if (dataManagerRef.current) return;

    const mlBackends = await api.callApi("mlBackends", {
      params: { project: project.id },
    });

    const interactiveBacked = (mlBackends ?? []).find(
      ({ is_interactive }) => is_interactive
    );

    const dataManager = (dataManagerRef.current =
      dataManagerRef.current ??
      (await initializeDataManager(root.current, props, {
        ...params,
        project,
        autoAnnotation: isDefined(interactiveBacked),
      })));

    Object.assign(window, { dataManager });

    dataManager.on("crash", (details) => {
      const error = details?.error;
      const isMissingTaskError = error?.startsWith("Task ID:");
      const isMissingProjectError = error?.startsWith("Project ID:");

      if (isMissingTaskError || isMissingProjectError) {
        const message = `The ${
          isMissingTaskError ? "task" : "project"
        } you are trying to access does not exist or is no longer available.`;

        toast.show({
          message,
          type: ToastType.error,
          duration: 10000,
        });
      }

      if (isMissingTaskError) {
        history.push(buildLink("", { id: params?.id ?? project?.id }));
      } else if (isMissingProjectError) {
        history.push("/projects");
      }
    });

    dataManager.on("settingsClicked", () => {
      history.push(
        buildLink("/settings/labeling", { id: params?.id ?? project?.id })
      );
    });

    dataManager.on("importClicked", () => {
      history.push(
        buildLink("/data/import", { id: params?.id ?? project?.id })
      );
    });

    // Navigate to Storage Settings and auto-open Add Source Storage modal
    dataManager.on("openSourceStorageModal", () => {
      history.push(
        buildLink("/settings/storage?open=source", {
          id: params?.id ?? project?.id,
        })
      );
    });

    dataManager.on("exportClicked", () => {
      history.push(
        buildLink("/data/export", { id: params?.id ?? project?.id })
      );
    });

    dataManager.on("error", (response) => {
      api.handleError(response);
    });

    dataManager.on("toast", ({ message, type }) => {
      toast.show({ message, type });
    });

    dataManager.on("navigate", (route) => {
      const target = route.replace(/^projects/, "");

      if (target)
        history.push(buildLink(target, { id: params?.id ?? project?.id }));
      else history.push("/projects");
    });

    if (interactiveBacked) {
      dataManager.on("lsf:regionFinishedDrawing", (reg, group) => {
        const { lsf, task, currentAnnotation: annotation } = dataManager.lsf;
        const ids = group.map((r) => r.cleanId);
        const result = annotation
          .serializeAnnotation()
          .filter((res) => ids.includes(res.id));

        const suggestionsRequest = api.callApi("mlInteractive", {
          params: { pk: interactiveBacked.id },
          body: {
            task: task.id,
            context: { result },
          },
        });

        // we'll check that we are processing the same task
        const wrappedRequest = new Promise(async (resolve, reject) => {
          const response = await suggestionsRequest;

          // right now task might be an old task,
          // so in order to get a current one we need to get it from lsf
          if (task.id === dataManager.lsf.task.id) {
            resolve(response);
          } else {
            reject();
          }
        });

        lsf.loadSuggestions(wrappedRequest, (response) => {
          if (response.data) {
            return response.data.result;
          }

          return null;
        });
      });
    }

    setContextProps({ dmRef: dataManager });
  }, [projectId]);

  // const highlightProcessedTasks = (idsToHighlight) => {
  //   // Bỏ dòng đọc localStorage ở đây đi
  //   // const storedIds = localStorage.getItem("highlight_tasks");

  //   if (!idsToHighlight || idsToHighlight.length === 0) return;

  //   // Chuyển ID về string để so sánh (nếu chưa phải string)
  //   const ids = idsToHighlight.map(String);

  //   const rows = document.querySelectorAll(".lsf-table-row");

  //   rows.forEach((row) => {
  //     if (row.dataset.highlighted === "true") return;

  //     const cells = row.querySelectorAll(".lsf-table__cell");
  //     let isMatch = false;

  //     cells.forEach((cell) => {
  //       if (ids.includes(cell.innerText.trim())) {
  //         isMatch = true;
  //       }
  //     });

  //     if (isMatch) {
  //       row.style.backgroundColor = "#dcfce7";
  //       row.style.transition = "background-color 0.3s";
  //       row.style.borderLeft = "4px solid #22c55e";
  //       row.dataset.highlighted = "true";
  //     }
  //   });
  // };
  // useEffect(() => {
  //   let observer = null;

  //   Promise.all(dependencies)
  //     .then(() => setLoading(false))
  //     .then(async () => {
  //       await init(); // Khởi tạo bảng xong

  //       // 1. Đọc dữ liệu từ Storage
  //       const storedIds = localStorage.getItem("highlight_tasks");

  //       if (storedIds) {
  //         const idsToHighlight = JSON.parse(storedIds);

  //         // 🔥 QUAN TRỌNG: Xóa ngay lập tức sau khi đã đọc được
  //         // Để nếu người dùng F5 lại trang thì sẽ không còn thấy màu nữa
  //         localStorage.removeItem("highlight_tasks");

  //         // 2. Chạy tô màu lần đầu (truyền biến đã đọc vào)
  //         highlightProcessedTasks(idsToHighlight);

  //         // 3. Thiết lập Observer
  //         const targetNode =
  //           document.querySelector(".datamanager") || document.body;

  //         observer = new MutationObserver((mutations) => {
  //           // Observer dùng lại biến idsToHighlight đang nằm trong bộ nhớ (Closure)
  //           // Không cần đọc lại từ localStorage nữa (vì đã xóa rồi)
  //           highlightProcessedTasks(idsToHighlight);
  //         });

  //         observer.observe(targetNode, {
  //           childList: true,
  //           subtree: true,
  //         });

  //         // (Tùy chọn) Tự ngắt sau 20s để giải phóng bộ nhớ
  //         setTimeout(() => {
  //           if (observer) observer.disconnect();
  //         }, 2000000);
  //       }
  //     });

  //   // Cleanup khi component bị hủy
  //   return () => {
  //     if (observer) observer.disconnect();
  //     destroyDM();
  //   };
  // }, [init]);

  // Thay thế hàm cũ bằng hàm này
  const applyRowHighlights = (rows, colorMap) => {
    // Nếu chưa có danh sách màu tool thì không làm gì cả
    if (Object.keys(colorMap).length === 0) return;

    rows.forEach((row) => {
      const cells = row.querySelectorAll(".lsf-table__cell");

      cells.forEach((cell) => {
        const cellText = cell.innerText ? cell.innerText.trim() : "";

        // Kiểm tra xem text trong ô có trùng với tên Tool nào không
        if (colorMap[cellText]) {
          const baseColor = colorMap[cellText];
          // Tạo màu nền nhạt (độ đậm 0.2)
          const bgRgba = hexToRgba(baseColor, 0.2);

          // Tô màu vĩnh viễn (dùng !important để đè CSS mặc định)
          row.style.setProperty("background-color", bgRgba, "important");
          row.style.setProperty(
            "border-left",
            `4px solid ${baseColor}`,
            "important"
          );
        }
      });
    });
  };

  useEffect(() => {
    let observer = null;

    Promise.all(dependencies)
      .then(() => setLoading(false))
      .then(async () => {
        await init();

        // 1. Lấy Map màu Tool (DÙNG FETCH THAY VÌ API.CALLAPI)
        let currentToolMap = {};
        try {
          // Gọi trực tiếp đường dẫn API, bỏ qua bộ wrapper bị lỗi
          const response = await fetch(`/api/tools?project=${project.id}`);

          if (response.ok) {
            const toolsData = await response.json();
            console.log("📡 Fetch Tools Response:", toolsData);

            if (toolsData && Array.isArray(toolsData)) {
              toolsData.forEach((tool) => {
                // Backend trả về 'color_data'
                if (tool.name && tool.color_data) {
                  currentToolMap[tool.name] = tool.color_data;
                }
              });
              console.log("🎨 Map Màu đã tạo:", currentToolMap);
            }
          } else {
            console.error(
              "❌ Fetch failed:",
              response.status,
              response.statusText
            );
          }
        } catch (err) {
          console.error("❌ Lỗi gọi API Tools:", err);
        }

        // 2. Hàm kích hoạt tô màu
        const runHighlight = () => {
          const rows = document.querySelectorAll(".lsf-table-row");
          if (rows.length === 0) return;

          // Nếu Map rỗng thì dừng
          if (Object.keys(currentToolMap).length === 0) return;

          rows.forEach((row) => {
            const cells = row.querySelectorAll(".lsf-table__cell");
            cells.forEach((cell) => {
              // Lấy text và trim() sạch sẽ
              const cellText = cell.innerText ? cell.innerText.trim() : "";

              if (currentToolMap[cellText]) {
                const baseColor = currentToolMap[cellText];
                const bgRgba = hexToRgba(baseColor, 0.2);

                // Tô màu
                row.style.setProperty("background-color", bgRgba, "important");
                row.style.setProperty(
                  "border-left",
                  `4px solid ${baseColor}`,
                  "important"
                );
              }
            });
          });
        };

        // Chạy ngay vài lần
        setTimeout(runHighlight, 1000);
        setTimeout(runHighlight, 3000);
        setTimeout(runHighlight, 5000);

        // Observer
        const targetNode =
          document.querySelector(".datamanager") || document.body;
        observer = new MutationObserver(() => runHighlight());
        observer.observe(targetNode, { childList: true, subtree: true });
      });

    return () => {
      if (observer) observer.disconnect();
      destroyDM();
    };
  }, [init]);

  const destroyDM = useCallback(() => {
    if (dataManagerRef.current) {
      dataManagerRef.current.destroy();
      dataManagerRef.current = null;
    }
  }, []);

  useEffect(() => {
    Promise.all(dependencies)
      .then(() => setLoading(false))
      .then(init);
  }, [init]);

  // Fetch tool name when tools are running
  useEffect(() => {
    if (hasRunningTools && project?.id) {
      fetch(`/api/tools?project=${project.id}`)
        .then(res => res.json())
        .then(tools => {
          if (tools && tools.length > 0) {
            setRunningToolName(tools[0].name);
          }
        })
        .catch(err => console.error('Failed to fetch tool names:', err));
    } else {
      setRunningToolName(null);
    }
  }, [hasRunningTools, project?.id]);

  useEffect(() => {
    // destroy the data manager when the component is unmounted
    return () => destroyDM();
  }, []);

  return crashed ? (
    <Block name="crash">
      <Elem name="info">Project was deleted or not yet created</Elem>

      <Button to="/projects" aria-label="Back to projects">
        Back to projects
      </Button>
    </Block>
  ) : (
    <>
      {loading && (
        <div className="flex-1 absolute inset-0 flex items-center justify-center">
          <Spinner size={64} />
        </div>
      )}
      
      {/* Tool Running Indicator - Floating at top left */}
      {hasRunningTools && (
        <div
          style={{
            position: 'fixed',
            top: '70px',
            left: '20px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 20px',
            backgroundColor: 'rgba(59, 130, 246, 0.95)',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            animation: 'slideInLeft 0.3s ease-out',
          }}
        >
          <Spinner 
            size="small" 
            style={{ 
              width: '20px', 
              height: '20px',
              color: 'white',
            }} 
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ 
              color: 'white', 
              fontWeight: '600',
              fontSize: '14px',
              lineHeight: '1.2',
            }}>
              Tool Running
            </span>
            <span style={{ 
              color: 'rgba(255, 255, 255, 0.9)', 
              fontSize: '12px',
              lineHeight: '1.2',
            }}>
              {runningToolName || `${runningCount} tool${runningCount > 1 ? 's' : ''} active`}
            </span>
          </div>
        </div>
      )}
      
      {/* Allow this to exist before the DataManager is initialized as the async app.fetchData call eventually calls startLabeling, and that requires the root element to exist */}
      <Block ref={root} name="datamanager" />
      
      <style>{`
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
};

DataManagerPage.path = "/data";
DataManagerPage.pages = {
  ExportPage,
  ImportModal,
};
DataManagerPage.context = ({ dmRef }) => {
  const { project } = useProject();
  const [mode, setMode] = useState(dmRef?.mode ?? "explorer");

  const links = {
    "/settings": "Settings",
  };

  const updateCrumbs = (currentMode) => {
    const isExplorer = currentMode === "explorer";

    if (isExplorer) {
      deleteCrumb("dm-crumb");
    } else {
      addCrumb({
        key: "dm-crumb",
        title: "Labeling",
      });
    }
  };

  const showLabelingInstruction = (currentMode) => {
    const isLabelStream = currentMode === "labelstream";
    const { expert_instruction, show_instruction } = project;

    if (isLabelStream && show_instruction && expert_instruction) {
      modal({
        title: "Labeling Instructions",
        body: <div dangerouslySetInnerHTML={{ __html: expert_instruction }} />,
        style: { width: 680 },
      });
    }
  };

  const onDMModeChanged = (currentMode) => {
    setMode(currentMode);
    updateCrumbs(currentMode);
    showLabelingInstruction(currentMode);
  };

  useEffect(() => {
    if (dmRef) {
      dmRef.on("modeChanged", onDMModeChanged);
    }

    return () => {
      dmRef?.off?.("modeChanged", onDMModeChanged);
    };
  }, [dmRef, project]);

  return project && project.id ? (
    <Space size="small">
      {project.expert_instruction && mode !== "explorer" && (
        <Button
          size="small"
          look="outlined"
          onClick={() => {
            modal({
              title: "Instructions",
              body: () => (
                <div
                  dangerouslySetInnerHTML={{
                    __html: project.expert_instruction,
                  }}
                />
              ),
            });
          }}
        >
          Instructions
        </Button>
      )}

      {Object.entries(links).map(([path, label]) => (
        <Link
          key={path}
          tag={NavLink}
          className={buttonVariant({ size: "small", look: "outlined" })}
          to={`/projects/${project.id}${path}`}
          data-external
        >
          {label}
        </Link>
      ))}
    </Space>
  ) : null;
};
