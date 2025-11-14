import { useCallback, useContext, useEffect, useState } from "react";
import {
  Button,
  Typography,
  Spinner,
  EmptyState,
  SimpleCard,
  Label,
} from "@humansignal/ui";
import { useUpdatePageTitle, createTitleFromSegments } from "@humansignal/core";
import { modal } from "../../../components/Modal/Modal";
import { IconSettings } from "@humansignal/icons";
import { useAPI } from "../../../providers/ApiProvider";
import { ProjectContext } from "../../../providers/ProjectProvider";
import { ToolSettingsForm } from "./Forms";
import { ToolList } from "./ToolList";
import "./ToolSettings.scss";

export const ToolSettings = () => {
  const api = useAPI();
  const { project, fetchProject } = useContext(ProjectContext);

  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [runningTools, setRunningTools] = useState({});

  useUpdatePageTitle(
    createTitleFromSegments([project?.title, "Tool Settings"])
  );

  // Helper lấy token/CSRF và build headers
  const getCookie = (name) =>
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(name + "="))
      ?.split("=")[1];

  const buildAuthHeaders = () => {
    const headers = { "Content-Type": "application/json" };
    const token =
      localStorage.getItem("access") || localStorage.getItem("token") || null;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    else {
      const csrftoken = getCookie("csrftoken");
      if (csrftoken) headers["X-CSRFToken"] = csrftoken;
    }
    return headers;
  };

  // === HÀM 1: LẤY DANH SÁCH TOOL (FETCH) ===
  const fetchTools = useCallback(async () => {
    setLoading(true);

    // Loại bỏ 'api' khỏi dependency vì không còn sử dụng api.callApi

    try {
      // TẠO URL TRỰC TIẾP ĐẾN BACKEND
      const url = `/api/tools?project=${encodeURIComponent(project.id)}`;

      // GỌI API BẰNG FETCH (GET method mặc định)
      const resp = await fetch(url, {
        method: "GET", // Tường minh hóa method là GET
        headers: buildAuthHeaders(),
      });

      // Xử lý lỗi HTTP (Đây là logic tối ưu hơn logic fallback cũ)
      if (!resp.ok) {
        let errorBody = await resp.text();
        try {
          errorBody = JSON.parse(errorBody);
        } catch {}

        console.error("HTTP Error fetching tools:", resp.status, errorBody);
        throw new Error(`HTTP ${resp.status} - Failed to fetch tools`);
      }

      // Trả về dữ liệu JSON
      const data = await resp.json();
      setTools(data || []);
    } catch (e) {
      // Xử lý lỗi mạng hoặc lỗi HTTP đã được raise
      console.error("Failed to fetch tools (Direct HTTP)", e);
      setTools([]);
    }

    setLoading(false);
    setLoaded(true);
  }, [project.id]);

  // === HÀM 2: MỞ MODAL (Thêm & Sửa) ===
  const showToolModal = useCallback(
    (tool = null) => {
      let modalRef;
      const isEdit = !!tool;

      // BỎ BIẾN ACTION NÀY VÀ THAY BẰNG FLAG BOOLEAN (nếu form được sửa)
      // Nếu form vẫn cần action string, chúng ta giữ nguyên tên:
      const action = isEdit ? "api_tools_partial_update" : "api_tools_create";
      const title = isEdit ? "Edit Tool" : "Add New Tool";

      const handleSubmit = (response) => {
        modalRef?.close();
        // Sau khi tạo/sửa thành công, gọi lại hàm fetch Tools
        fetchTools();
      };

      modalRef = modal({
        title: title,
        style: { width: 760 },
        closeOnClickOutside: false,
        body: (
          <ToolSettingsForm
            // VẪN TRUYỀN ACTION NÀY XUỐNG, GIẢ SỬ FORM VẪN CẦN NÓ ĐỂ XÁC ĐỊNH LÀ CREATE HAY UPDATE
            action={action}
            project={project}
            tool={tool}
            onSubmit={handleSubmit}
          />
        ),
      });
    },
    // SỬA ĐỔI: BỎ 'api' khỏi dependency array
    [project, fetchTools]
  );
  // === HÀM 3: XÓA TOOL (DELETE) ===
  const handleDeleteTool = useCallback(
    async (tool) => {
      if (confirm(`Are you sure you want to delete the tool "${tool.name}"?`)) {
        try {
          // SỬA ĐỔI: CHỈ GIỮ LẠI LOGIC FETCH TRỰC TIẾP
          const url = `/api/tools/${tool.id}`;
          const resp = await fetch(url, {
            method: "DELETE",
            headers: buildAuthHeaders(),
          });

          // DRF trả về 204 No Content khi DELETE thành công, resp.ok vẫn là true
          if (!resp.ok) {
            // Xử lý lỗi chi tiết hơn nếu cần
            let errorBody = await resp.text();
            try {
              errorBody = JSON.parse(errorBody);
            } catch {}
            console.error("HTTP Error deleting tool:", resp.status, errorBody);
            throw new Error(`HTTP ${resp.status} - Failed to delete tool`);
          }

          fetchTools(); // Tải lại danh sách sau khi xóa
        } catch (e) {
          console.error("Failed to delete tool:", e);
          // Bạn có thể hiển thị thông báo lỗi modal ở đây nếu muốn
        }
      }
    },
    // SỬA ĐỔI: BỎ 'api' khỏi dependency array
    [fetchTools]
  );

  // === HÀM 4: CHẠY TOOL (RUN) ===
  const handleRunTool = useCallback(
    async (tool) => {
      setRunningTools((prev) => ({ ...prev, [tool.id]: true }));
      try {
        let result;

        // SỬA ĐỔI: CHỈ GIỮ LẠI LOGIC FETCH TRỰC TIẾP
        const url = `/api/tools/${tool.id}/run`; // Endpoint POST tùy chỉnh
        const resp = await fetch(url, {
          method: "POST",
          headers: buildAuthHeaders(),
          body: JSON.stringify(tool.input_data || {}), // Đảm bảo gửi body JSON
        });

        if (!resp.ok) {
          let errorBody = await resp.text();
          try {
            errorBody = JSON.parse(errorBody);
          } catch {}
          console.error("HTTP Error running tool:", resp.status, errorBody);
          throw new Error(errorBody?.detail || `HTTP ${resp.status}`);
        }

        result = await resp.json();

        // Hiển thị kết quả thành công
        modal({
          title: `Sucessfull running: ${tool.name}`,
          canClose: true,
          body: (
            <div>
              <Label text="Raw Label from Tool" large />
              <pre
                style={{
                  background: "#f4f4f4",
                  padding: "1rem",
                  borderRadius: "4px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          ),
        });
      } catch (e) {
        // Xử lý lỗi mạng hoặc lỗi HTTP
        modal({
          title: `Chạy Tool Thất bại: ${tool.name}`,
          canClose: true,
          body: (
            <div style={{ color: "red" }}>
              <Label text="Lỗi" large />
              <pre>{e.message || JSON.stringify(e, null, 2)}</pre>
            </div>
          ),
        });
      } finally {
        setRunningTools((prev) => ({ ...prev, [tool.id]: false }));
      }
    },
    // SỬA ĐỔI: BỎ 'api' khỏi dependency array
    [modal, buildAuthHeaders]
  );

  useEffect(() => {
    // Chỉ gọi fetchTools nếu project đã có ID (đã được tải)
    if (project?.id) {
      fetchTools();
    }
  }, [project?.id, fetchTools]);
  // === PHẦN RENDER (JSX) ===
  // (Phần này đã đúng, không cần sửa)
  return (
    <section>
      <div className="w-[42rem]">
        <Typography variant="headline" size="medium" className="mb-base">
          Tools
        </Typography>

        {loading && <Spinner size={32} />}

        {loaded && tools.length === 0 && (
          <SimpleCard
            title=""
            className="bg-primary-background border-primary-border-subtler p-base"
          >
            <EmptyState
              size="medium"
              variant="primary"
              icon={<IconSettings />}
              title="No tools connected yet"
              description="Connect or configure labeling tools for your project. Customize annotation interfaces and control labeling behavior."
              actions={
                <Button
                  variant="primary"
                  look="filled"
                  onClick={() => showToolModal()}
                  aria-label="Add new tool"
                >
                  Add Tool
                </Button>
              }
            />
          </SimpleCard>
        )}

        {loaded && tools.length > 0 && (
          <>
            <div style={{ textAlign: "right", marginBottom: "1rem" }}>
              <Button
                variant="primary"
                look="filled"
                onClick={() => showToolModal()}
                aria-label="Add new tool"
              >
                Add Tool
              </Button>
            </div>

            <ToolList
              tools={tools}
              onEdit={showToolModal}
              onDelete={handleDeleteTool}
              onRunTool={handleRunTool}
              runningTools={runningTools}
            />
          </>
        )}
      </div>
    </section>
  );
};

ToolSettings.title = "Tools";
ToolSettings.path = "/tools";
