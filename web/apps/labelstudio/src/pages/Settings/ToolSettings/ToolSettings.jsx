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

  // === QUẢN LÝ STATE ===
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [runningTools, setRunningTools] = useState({});

  useUpdatePageTitle(
    createTitleFromSegments([project?.title, "Tool Settings"])
  );

  // === HÀM 1: LẤY DANH SÁCH TOOL (FETCH) ===
  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      // (SỬA LỖI: 'tools' -> 'tools_list')
      const toolData = await api.callApi("tools_list", {
        params: { project: project.id },
      });
      setTools(toolData || []);
    } catch (e) {
      console.error("Failed to fetch tools", e);
    }
    setLoading(false);
    setLoaded(true);
  }, [api, project.id]);

  // Tự động gọi fetchTools khi tải trang
  useEffect(() => {
    if (project.id) {
      fetchTools();
    }
  }, [project.id, fetchTools]);

  // === HÀM 2: MỞ MODAL (Thêm & Sửa) ===
  const showToolModal = useCallback(
    (tool = null) => {
      let modalRef;
      const isEdit = !!tool;

      // (SỬA LỖI: Dùng nickname đúng của backend)
      const action = isEdit ? "tools_partial_update" : "tools_create";
      const title = isEdit ? "Edit Tool" : "Add New Tool";

      const handleSubmit = (response) => {
        modalRef?.close();
        fetchTools(); // Tải lại danh sách sau khi lưu
      };

      modalRef = modal({
        title: title,
        style: { width: 760 },
        closeOnClickOutside: false,
        body: (
          <ToolSettingsForm
            action={action} // (action bây giờ là "tools_create" hoặc "tools_partial_update")
            project={project}
            tool={tool}
            onSubmit={handleSubmit}
          />
        ),
      });
    },
    [project, fetchTools, api]
  );

  // === HÀM 3: XÓA TOOL (DELETE) ===
  const handleDeleteTool = useCallback(
    async (tool) => {
      if (confirm(`Are you sure you want to delete the tool "${tool.name}"?`)) {
        try {
          // (SỬA LỖI: 'deleteTool' -> 'tools_destroy')
          await api.callApi("tools_destroy", {
            params: { pk: tool.id },
          });
          fetchTools(); // Tải lại danh sách
        } catch (e) {
          console.error("Failed to delete tool:", e);
        }
      }
    },
    [api, fetchTools]
  );

  // === HÀM 4: CHẠY TOOL (RUN) ===
  const handleRunTool = useCallback(
    async (tool) => {
      // (a) Đặt trạng thái "đang chạy"
      setRunningTools((prev) => ({
        ...prev,
        [tool.id]: true,
      }));

      try {
        // (b) (SỬA LỖI: 'runTool' -> 'tools_run')
        const result = await api.callApi("tools_run", {
          params: { pk: tool.id },
        });

        // (c) THÀNH CÔNG: Mở modal hiển thị kết quả
        modal({
          title: `Kết quả chạy Tool: ${tool.name}`,
          canClose: true,
          body: (
            <div>
              <Label text="Kết quả thô từ Tool" large />
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
        // (d) THẤT BẠI: Mở modal hiển thị lỗi
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
        // (e) Xóa trạng thái "đang chạy"
        setRunningTools((prev) => ({
          ...prev,
          [tool.id]: false,
        }));
      }
    },
    [api, modal] // (SỬA LỖI: Thêm 'modal' vào dependency array)
  );

  // === PHẦN RENDER (JSX) ===
  // (Phần này đã đúng, không cần sửa)
  return (
    <section>
      <div className="w-[42rem]">
        <Typography variant="headline" size="medium" className="mb-base">
          Tools
        </Typography>

        {/* Trạng thái 1: Đang Tải Trang */}
        {loading && <Spinner size={32} />}

        {/* Trạng thái 2: Đã Tải, không có dữ liệu */}
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

        {/* Trạng thái 3: Đã Tải, có dữ liệu */}
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
              onEdit={showToolModal} // (Truyền hàm Sửa)
              onDelete={handleDeleteTool} // (Truyền hàm Xóa)
              onRunTool={handleRunTool} // (Truyền hàm Chạy)
              runningTools={runningTools} // (Truyền state đang chạy)
            />
          </>
        )}
      </div>
    </section>
  );
};

ToolSettings.title = "Tools";
ToolSettings.path = "/tools";
