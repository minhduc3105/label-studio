import chr from "chroma-js";
import { format } from "date-fns";
import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { IconCheck, IconEllipsis, IconMinus, IconSparks } from "@humansignal/icons";
import { Userpic, Button, Spinner, Tooltip } from "@humansignal/ui";
import { Dropdown, Menu, Pagination } from "../../components";
import { Block, Elem } from "../../utils/bem";
import { absoluteURL } from "../../utils/helpers";
import { useToolRunning } from "../../providers/ToolRunningProvider";
import { cn } from "../../utils/bem";
import { ProjectStateChip } from "@humansignal/app-common";

const DEFAULT_CARD_COLORS = ["#FFFFFF", "#FDFDFC"];

export const ProjectsList = ({ projects, currentPage, totalItems, loadNextPage, pageSize }) => {
  return (
    <>
      <div className={cn("projects-page").elem("list").toClassName()}>
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
      <div className={cn("projects-page").elem("pages").toClassName()}>
        <Pagination
          name="projects-list"
          label="Projects"
          page={currentPage}
          totalItems={totalItems}
          urlParamName="page"
          pageSize={pageSize}
          pageSizeOptions={[10, 30, 50, 100]}
          onPageLoad={(page, pageSize) => loadNextPage(page, pageSize)}
        />
      </div>
    </>
  );
};

const ProjectCard = ({ project }) => {
  const { isToolRunning, getRunningToolsCount } = useToolRunning();
  const hasRunningTools = isToolRunning(project.id);
  const runningCount = getRunningToolsCount(project.id);

  const color = useMemo(() => {
    return DEFAULT_CARD_COLORS.includes(project.color) ? null : project.color;
  }, [project.color]);

  const projectColors = useMemo(() => {
    if (!color) return {};
    return {
      "--header-color": color,
      "--background-color": chr(color).alpha(0.15).css(),
      "--border-color": chr(color).alpha(0.4).css(),
    };
  }, [color]);

  return (
    <NavLink
      className={cn("projects-page").elem("link").toClassName()}
      to={`/projects/${project.id}/data`}
      data-external
    >
      <Block name="project-card" mod={{ colored: !!color, running: hasRunningTools }} style={projectColors}>
        <Elem name="header">
          <Elem name="title">
            <Elem name="title-text-wrapper">
              {hasRunningTools && (
                <Elem name="tool-running-indicator">
                  <Spinner size="small" />
                  <span>{runningCount} running</span>
                </Elem>
              )}
              <Tooltip title={project.title ?? "New project"}>
                <Elem name="title-text">
                  {project.title ?? "New project"}
                </Elem>
              </Tooltip>
            </Elem>

            <Elem name="menu" onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}>
              <Dropdown.Trigger
                content={
                  <Menu contextual>
                    <Menu.Item href={`/projects/${project.id}/settings`}>Settings</Menu.Item>
                    <Menu.Item href={`/projects/${project.id}/data?labeling=1`}>Label</Menu.Item>
                  </Menu>
                }
              >
                <Button size="smaller" look="string" aria-label="Project options">
                  <IconEllipsis />
                </Button>
              </Dropdown.Trigger>
            </Elem>

            {project.state && (
              <Elem name="state-chip">
                <ProjectStateChip state={project.state} projectId={project.id} interactive={false} />
              </Elem>
            )}
          </Elem>

          <Elem name="summary">
            <Elem name="annotation">
              <Elem name="total">
                {project.finished_task_number} / {project.task_number}
              </Elem>
              <Elem name="detail">
                <Elem name="detail-item" mod={{ type: "completed" }}>
                  <IconCheck />
                  {project.total_annotations_number}
                </Elem>
                <Elem name="detail-item" mod={{ type: "rejected" }}>
                  <IconMinus />
                  {project.skipped_annotations_number}
                </Elem>
                <Elem name="detail-item" mod={{ type: "predictions" }}>
                  <IconSparks />
                  {project.total_predictions_number}
                </Elem>
              </Elem>
            </Elem>
          </Elem>
        </Elem>

        <Elem name="description">{project.description}</Elem>

        <Elem name="info">
          <Elem name="created-date">
            {format(new Date(project.created_at), "dd MMM yyyy, HH:mm")}
          </Elem>
          <Elem name="created-by">
            <Userpic src="#" user={project.created_by} showUsernameTooltip />
          </Elem>
        </Elem>
      </Block>
    </NavLink>
  );
};