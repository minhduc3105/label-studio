import { useCallback, useContext, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Button,
  Typography,
  Spinner,
  EmptyState,
  SimpleCard,
} from "@humansignal/ui";
import { useUpdatePageTitle, createTitleFromSegments } from "@humansignal/core";
import { Form, Label, Toggle } from "../../../components/Form";
import { modal } from "../../../components/Modal/Modal";
import { IconModels, IconExternal, IconSettings } from "@humansignal/icons";
import { useAPI } from "../../../providers/ApiProvider";
import { ProjectContext } from "../../../providers/ProjectProvider";
import { ToolSettingsForm } from "./Forms";
import "./ToolSettings.scss";

export const ToolSettings = () => {
  const api = useAPI();
  const { project, fectchProject } = useContext(ProjectContext);
  const [backends, setBackends] = useState([]);

  const showToolModal = useCallback(() => {
    // tạo biến ref để có thể đóng modal sau submit
    let modalRef;

    const handleSubmit = (response) => {
      // đóng modal sau khi form submit thành công
      modalRef?.close();
      // có thể refresh lại project hoặc danh sách tools nếu cần
      fectchProject?.();
    };

    // tạo modal
    modalRef = modal({
      title: "Add New Tool",
      style: { width: 760 },
      closeOnClickOutside: false,
      body: (
        <ToolSettingsForm
          action="create"
          project={project}
          onSubmit={handleSubmit}
        />
      ),
    });
  }, [project, fectchProject]);

  return (
    <section>
      <div className="w-[42rem]">
        <Typography variant="headline" size="medium" className="mb-base">
          Tools
        </Typography>

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
                onClick={showToolModal}
                aria-label="Add new tool"
              >
                Add Tool
              </Button>
            }
          />
        </SimpleCard>
      </div>
    </section>
  );
};

ToolSettings.title = "Tools";
ToolSettings.path = "/tools";
