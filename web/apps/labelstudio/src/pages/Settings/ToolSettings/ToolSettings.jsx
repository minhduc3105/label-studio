import { useCallback, useContext, useEffect, useState } from "react";
import {
  Button,
  Typography,
  Spinner,
  EmptyState,
  SimpleCard,
} from "@humansignal/ui";
import { useUpdatePageTitle, createTitleFromSegments } from "@humansignal/core";
import { modal } from "../../../components/Modal/Modal";
import { IconSettings } from "@humansignal/icons";
import { useAPI } from "../../../providers/ApiProvider";
import { ProjectContext } from "../../../providers/ProjectProvider";
import { ToolSettingsForm } from "./Forms";
import { ToolList } from "./ToolList"; // (Bạn sẽ cần tạo file này)
import "./ToolSettings.scss";

export const ToolSettings = () => {
  const api = useAPI();
  const { project, fetchProject } = useContext(ProjectContext);

  // Set state để quản lý trạng thái của trang
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useUpdatePageTitle(
    createTitleFromSegments([project?.title, "Tool Settings"])
  );

  // (5) THÊM: Hàm gọi API để lấy danh sách tools
  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      // Dùng `api.callApi` với 'tools' (tên chúng ta đã đăng ký ở backend)
      const toolData = await api.callApi("tools", {
        params: { project: project.id }, // Lọc theo project ID
      });
      setTools(toolData || []); // Đảm bảo 'tools' luôn là một mảng
    } catch (e) {
      console.error("Failed to fetch tools", e);
    }
    setLoading(false);
    setLoaded(true);
  }, [api, project.id]);

  // (6) THÊM: Tự động gọi fetchTools khi component được tải (mounted)
  useEffect(() => {
    if (project.id) {
      fetchTools();
    }
  }, [project.id, fetchTools]);

  // (7) CẬP NHẬT: showToolModal để xử lý cả "Thêm" và "Sửa"
  const showToolModal = useCallback(
    (tool = null) => {
      // 'tool' có thể là null (Thêm) hoặc object (Sửa)
      let modalRef;

      // Tự động xác định action và title
      const isEdit = !!tool;
      const action = isEdit ? "updateTool" : "createTool";
      const title = isEdit ? "Edit Tool" : "Add New Tool";

      // Cập nhật handleSubmit
      const handleSubmit = (response) => {
        modalRef?.close();
        fetchTools(); // <-- QUAN TRỌNG: Tải lại danh sách tool, không phải fetchProject
      };

      // Tạo modal
      modalRef = modal({
        title: title, // Dùng title động
        style: { width: 760 },
        closeOnClickOutside: false,
        body: (
          <ToolSettingsForm
            action={action} // Dùng action động
            project={project}
            tool={tool} // Truyền 'tool' (có thể là null) vào form
            onSubmit={handleSubmit}
          />
        ),
      });
    },
    [project, fetchTools, api] // Thêm 'fetchTools' và 'api' vào dependencies
  );

  // (8) THÊM: Hàm xử lý xóa một tool
  const handleDeleteTool = useCallback(
    async (tool) => {
      // Thêm xác nhận trước khi xóa
      if (confirm(`Are you sure you want to delete the tool "${tool.name}"?`)) {
        try {
          // Gọi API 'deleteTool' (đã tự động tạo bởi ModelViewSet)
          await api.callApi("deleteTool", {
            params: { pk: tool.id }, // Gửi ID (pk) của tool cần xóa
          });
          fetchTools(); // Tải lại danh sách sau khi xóa thành công
        } catch (e) {
          console.error("Failed to delete tool:", e);
        }
      }
    },
    [api, fetchTools] // Thêm dependencies
  );

  // (9) CẬP NHẬT: Toàn bộ phần render để hiển thị theo trạng thái (loading, loaded, empty)
  return (
    <section>
      <div className="w-[42rem]">
        <Typography variant="headline" size="medium" className="mb-base">
          Tools
        </Typography>

        {/* Trạng thái 1: Đang Tải */}
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
            {/* Nút "Add Tool" ở trên cùng (khi đã có danh sách) */}
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

            {/* Component ToolList để render danh sách */}
            <ToolList
              tools={tools}
              onEdit={showToolModal}
              onDelete={handleDeleteTool}
            />
          </>
        )}
      </div>
    </section>
  );
};

ToolSettings.title = "Tools";
ToolSettings.path = "/tools";
