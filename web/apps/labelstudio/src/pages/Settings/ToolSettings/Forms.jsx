import { useState, useCallback } from "react";
import { IconTrash } from "@humansignal/icons";
import { Button } from "@humansignal/ui";
import { Form, Input, Select, Label } from "../../../components/Form";
import "./ToolSettings.scss";

const ToolSettingsForm = ({ action, backend, project, onSubmit }) => {
  const [inputFields, setInputFields] = useState([
    { id: Date.now(), name: "", type: "string" },
  ]);
  const [outputFields, setOutputFields] = useState([
    { id: Date.now() + 1, name: "", type: "string" },
  ]);

  const addField = useCallback((section) => {
    const newField = { id: Date.now(), name: "", type: "string" };
    if (section === "input") setInputFields((prev) => [...prev, newField]);
    if (section === "output") setOutputFields((prev) => [...prev, newField]);
  }, []);

  const removeField = useCallback((section, id) => {
    if (section === "input")
      setInputFields((prev) => prev.filter((f) => f.id !== id));
    if (section === "output")
      setOutputFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleChange = useCallback((value) => {
    console.log("Input changed:", value);
  }, []);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (onSubmit) onSubmit({ input: inputFields, output: outputFields });
    },
    [inputFields, outputFields, onSubmit]
  );

  const typeOptions = [
    { label: "String", value: "string" },
    { label: "Number", value: "number" },
    { label: "Boolean", value: "boolean" },
    { label: "Date", value: "date" },
    { label: "JSON", value: "json" },
    { label: "JSONB", value: "jsonb" },
    { label: "Text", value: "text" },
    { label: "Float", value: "float" },
    { label: "Integer", value: "integer" },
  ];

  const renderFields = (fields, section) =>
    fields.map((field) => (
      <Form.Row key={field.id} columnCount={3} className="field-row">
        <Input
          name={`name-${field.id}`}
          label="Tên trường"
          placeholder="Nhập tên biến..."
        />
        <Select
          name={`type-${field.id}`}
          label="Kiểu dữ liệu"
          value={field.type}
          options={typeOptions}
          onChange={(e) => handleChange(e.target.value)}
        />

        <Button
          variant="text"
          onClick={() => removeField(section, field.id)}
          style={{
            width: "32px",
            height: "32px",
            minWidth: "32px",
            minHeight: "32px",
            padding: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            alignSelf: "flex-end",
            color: "#aaa",
            backgroundColor: "transparent",
            border: "none",
            cursor: "pointer",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "red")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#aaa")}
          aria-label="Xóa trường"
          title="Xóa trường này"
        >
          <IconTrash />
        </Button>
      </Form.Row>
    ));

  const renderAddButton = (section) => (
    <Form.Row
      columnCount={1}
      style={{
        display: "flex",
        justifyContent: "flex-start",
        marginTop: "0.25rem",
      }}
    >
      <Button
        variant="text"
        type="button"
        onClick={() => addField(section)}
        style={{
          color: "#888",
          backgroundColor: "transparent",
          border: "none",
          padding: "0.25rem 0.5rem",
          cursor: "pointer",
          opacity: 0.5,
          transition: "opacity 0.2s, color 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.color = "#000";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "0.5";
          e.currentTarget.style.color = "#888";
        }}
      >
        + Thêm trường
      </Button>
    </Form.Row>
  );

  return (
    <Form onSubmit={handleSubmit}>
      <Input type="hidden" name="project" value={project.id} />

      <Form.Row columnCount={1}>
        <Input name="title" label="Name" placeholder="Enter a name" required />
      </Form.Row>

      <Form.Row columnCount={1}>
        <Input name="url" label="Backend URL" required />
      </Form.Row>

      {/* Input Fields */}
      <Form.Row columnCount={1}>
        <Label text="Input Configuration" large />
      </Form.Row>
      {renderFields(inputFields, "input")}
      {renderAddButton("input")}

      {/* Output Fields */}
      <Form.Row columnCount={1}>
        <Label text="Output Configuration" large />
      </Form.Row>
      {renderFields(outputFields, "output")}
      {renderAddButton("output")}

      {/* Submit */}
      <Form.Row columnCount={1}>
        <Button variant="primary" type="submit">
          Lưu Tool
        </Button>
      </Form.Row>
    </Form>
  );
};

export { ToolSettingsForm };
