// (GHI CHÚ: File này có thể là 'Forms.js' hoặc 'ToolSettingsForm.jsx')

import { useState, useCallback, useEffect } from "react";
import { IconTrash } from "@humansignal/icons";
import { Button, Label } from "@humansignal/ui"; // (1) Đảm bảo Label đã được import
import { Form, Input } from "../../../components/Form"; // (2) Chúng ta chỉ dùng Form.Row và Input từ đây
import { useAPI } from "../../../providers/ApiProvider";
import "./ToolSettings.scss";

// (3) Export trực tiếp với tên ToolSettingsForm
export const ToolSettingsForm = ({
  action, // (NHẬN 'action' đã có tên đúng, ví dụ: 'tools_create' hoặc 'tools_partial_update')
  tool,
  project,
  onSubmit, // Callback để đóng modal
}) => {
  const api = useAPI();

  // (File này KHÔNG HỀ BIẾT 'isEdit' là gì)

  // === QUẢN LÝ STATE CHO FORM NÀY ===
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [inputFields, setInputFields] = useState([
    { id: Date.now(), key: "", value: "" },
  ]);
  const [outputFields, setOutputFields] = useState([
    { id: Date.now() + 1, key: "", value: "" },
  ]);

  // === CÁC HÀM HỖ TRỢ (HELPER) ===
  const jsonToFields = (json) => {
    if (!json || typeof json !== "object")
      return [{ id: Date.now(), key: "", value: "" }];
    const fields = Object.entries(json).map(([key, value], i) => ({
      id: Date.now() + i,
      key,
      value: String(value),
    }));
    return fields.length ? fields : [{ id: Date.now(), key: "", value: "" }];
  };

  const fieldsToJson = (fields) => {
    return fields.reduce((acc, field) => {
      if (field.key) acc[field.key] = field.value;
      return acc;
    }, {});
  };

  // === EFFECT: ĐIỀN DỮ LIỆU KHI "EDIT" ===
  useEffect(() => {
    if (tool) {
      // Chế độ "Edit"
      setName(tool.name || "");
      setEndpoint(tool.endpoint || "");
      setInputFields(jsonToFields(tool.input_data));
      setOutputFields(jsonToFields(tool.output_data));
    } else {
      // Chế độ "Create"
      setName("");
      setEndpoint("");
      setInputFields([{ id: Date.now(), key: "", value: "" }]);
      setOutputFields([{ id: Date.now() + 1, key: "", value: "" }]);
    }
  }, [tool]);

  // === CÁC HÀM XỬ LÝ (HANDLER) CHO TRƯỜNG ĐỘNG ===
  const addField = useCallback((section) => {
    const newField = { id: Date.now(), key: "", value: "" };
    if (section === "input") setInputFields((prev) => [...prev, newField]);
    if (section === "output") setOutputFields((prev) => [...prev, newField]);
  }, []);

  const removeField = useCallback((section, id) => {
    if (section === "input")
      setInputFields((prev) => prev.filter((f) => f.id !== id));
    if (section === "output")
      setOutputFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleFieldChange = useCallback(
    (section, id, fieldName, fieldValue) => {
      const setter = section === "input" ? setInputFields : setOutputFields;
      setter((prev) =>
        prev.map((field) =>
          field.id === id ? { ...field, [fieldName]: fieldValue } : field
        )
      );
    },
    []
  );

  // === HÀM RENDER CHO TRƯỜNG ĐỘNG ===
  const renderFields = (fields, section) =>
    fields.map((field) => (
      <Form.Row key={field.id} columnCount={3} className="field-row">
        <Input
          name={`key-${field.id}`}
          label="Key"
          placeholder="e.g., alpha"
          value={field.key}
          onChange={(e) =>
            handleFieldChange(section, field.id, "key", e.target.value)
          }
        />
        <Input
          name={`value-${field.id}`}
          label="Value"
          placeholder="e.g., 0.5"
          value={field.value}
          onChange={(e) =>
            handleFieldChange(section, field.id, "value", e.target.value)
          }
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
          aria-label="Delete"
          title="Delete"
        >
          <IconTrash />
        </Button>
      </Form.Row>
    ));

  const renderAddButton = (section) => (
    <Form.Row style={{ justifyContent: "flex-start" }}>
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

  // === HÀM SUBMIT (GỌI API) ===
  const handleSubmit = useCallback(async () => {
    if (!name || !endpoint) {
      alert("Name và Endpoint là bắt buộc.");
      return;
    }

    const payload = {
      name: name,
      endpoint: endpoint,
      project: project.id,
      input_data: fieldsToJson(inputFields),
      output_data: fieldsToJson(outputFields),
    };

    // Helper: lấy cookie (giữ nguyên, nhưng được đưa vào trong hàm để không cần dependency)
    const getCookie = (name) =>
      document.cookie
        .split("; ")
        .find((v) => v.startsWith(name + "="))
        ?.split("=")[1];

    try {
      const isPatch = action === "api_tools_partial_update" && tool;
      const url = isPatch ? `/api/tools/${tool.id}` : `/api/tools`;
      const method = isPatch ? "PATCH" : "POST";

      // Tái tạo logic headers từ khối catch cũ
      const headers = { "Content-Type": "application/json" };
      const token =
        localStorage.getItem("access") || localStorage.getItem("token") || null;

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        const csrftoken = getCookie("csrftoken");
        if (csrftoken) headers["X-CSRFToken"] = csrftoken;
      }

      // GỌI API BẰNG FETCH TRỰC TIẾP
      const resp = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text();

        // Xử lý lỗi cụ thể hơn để in ra console
        let errorDetails = text;
        try {
          errorDetails = JSON.parse(text);
        } catch {}

        console.error("Lỗi HTTP khi lưu Tool:", resp.status, errorDetails);
        throw new Error(`HTTP ${resp.status}: ${text}`);
      }

      // Đã lưu/cập nhật thành công
      // const savedTool = await resp.json(); // Lấy đối tượng Tool đã lưu nếu cần
      onSubmit();
    } catch (err) {
      // Xử lý lỗi từ fetch hoặc lỗi HTTP đã được raise
      console.error("Lỗi khi lưu Tool:", err.message || err);
      // Tùy chọn: Hiển thị thông báo lỗi thân thiện hơn cho người dùng
      alert(`Lỗi khi lưu Tool. Vui lòng kiểm tra console.`);
    }
  }, [
    action,
    endpoint,
    inputFields,
    name,
    onSubmit,
    outputFields,
    project.id,
    tool,
  ]);

  // === PHẦN RENDER (JSX) ===
  // (SỬA LỖI: Thay <Form> bằng <div> và <Button type="submit"> bằng <Button onClick={...}>)
  return (
    <div className="custom-tool-form">
      <Form.Row columnCount={1}>
        <Input
          name="name"
          label="Name"
          placeholder="Enter a name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Form.Row>

      <Form.Row columnCount={1}>
        <Input
          name="endpoint"
          label="Backend URL (Endpoint)"
          required
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
        />
      </Form.Row>

      <Form.Row columnCount={1}>
        <Label text="Input Configuration (Key / Value)" large />
      </Form.Row>
      {renderFields(inputFields, "input")}
      {renderAddButton("input")}

      <Form.Row columnCount={1}>
        <Label text="Output Configuration (Key / Value)" large />
      </Form.Row>
      {renderFields(outputFields, "output")}
      {renderAddButton("output")}

      {/* Nút Submit */}
      <Form.Row
        columnCount={1}
        style={{ marginTop: "1rem", justifyContent: "flex-end" }}
      >
        <Button
          variant="primary"
          onClick={handleSubmit} // (SỬA LỖI QUAN TRỌNG NHẤT)
          aria-label={tool ? "Save Changes" : "Add Tool"}
        >
          {tool ? "Save Changes" : "Add Tool"}
        </Button>
      </Form.Row>
    </div>
  );
};
