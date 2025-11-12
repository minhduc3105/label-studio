// (1) THÊM: import 'useEffect' và 'useAPI'
import { useState, useCallback, useEffect } from "react";
import { IconTrash } from "@humansignal/icons";
import { Button } from "@humansignal/ui";
import { Form, Input, Label } from "../../../components/Form";
// (2) XÓA: 'Select' không còn được dùng, chúng ta sẽ làm nhất quán key/value
// import { Select } from "../../../components/Form";
import { useAPI } from "../../../providers/ApiProvider"; // (1) THÊM
import "./ToolSettings.scss";

// (3) SỬA: Props
// Bỏ 'backend', thêm 'tool' (có thể là null)
const ToolSettingsForm = ({ action, tool, project, onSubmit }) => {
  const api = useAPI(); // (4) THÊM: Lấy API provider

  // (5) THÊM: State cho các trường chính (để kiểm soát form)
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");

  // (6) SỬA: State cho các trường động
  // Chúng ta sẽ làm nhất quán: cả input và output đều là (key, value)
  const [inputFields, setInputFields] = useState([
    { id: Date.now(), key: "", value: "" },
  ]);
  const [outputFields, setOutputFields] = useState([
    { id: Date.now() + 1, key: "", value: "" },
  ]);

  // (7) THÊM: Helper Functions (Hàm hỗ trợ)
  // Chuyển đổi từ JSON {a: 'b'} sang array [{id: 1, key: 'a', value: 'b'}]
  const jsonToFields = (json) => {
    if (!json || typeof json !== "object")
      return [{ id: Date.now(), key: "", value: "" }];
    const fields = Object.entries(json).map(([key, value], i) => ({
      id: Date.now() + i,
      key,
      value: String(value), // Luôn chuyển sang string để <Input> hiển thị
    }));
    return fields.length ? fields : [{ id: Date.now(), key: "", value: "" }];
  };

  // Chuyển đổi từ array [{key: 'a', value: 'b'}] sang JSON {a: 'b'}
  const fieldsToJson = (fields) => {
    return fields.reduce((acc, field) => {
      if (field.key) acc[field.key] = field.value; // Chỉ thêm nếu có key
      return acc;
    }, {});
  };

  // (8) THÊM: useEffect để điền dữ liệu khi ở chế độ "Edit" (Sửa)
  useEffect(() => {
    if (tool) {
      // Chế độ "Edit": Điền dữ liệu từ 'tool'
      setName(tool.name || "");
      setEndpoint(tool.endpoint || "");
      setInputFields(jsonToFields(tool.input_data));
      setOutputFields(jsonToFields(tool.output_data));
    } else {
      // Chế độ "Create" (Thêm): Reset form về rỗng
      setName("");
      setEndpoint("");
      setInputFields([{ id: Date.now(), key: "", value: "" }]);
      setOutputFields([{ id: Date.now() + 1, key: "", value: "" }]);
    }
  }, [tool]); // Chạy lại khi 'tool' thay đổi

  // (9) SỬA: Logic thêm/xóa trường
  const addField = useCallback((section) => {
    const newField = { id: Date.now(), key: "", value: "" }; // Sửa thành key/value
    if (section === "input") setInputFields((prev) => [...prev, newField]);
    if (section === "output") setOutputFields((prev) => [...prev, newField]);
  }, []);

  const removeField = useCallback((section, id) => {
    // Giữ lại logic cũ của bạn (đã đúng)
    if (section === "input")
      setInputFields((prev) => prev.filter((f) => f.id !== id));
    if (section === "output")
      setOutputFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // (10) THÊM: Hàm xử lý thay đổi cho các trường động
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

  // (11) SỬA: Hàm renderFields
  // Làm cho cả 'input' và 'output' nhất quán (key, value)
  const renderFields = (fields, section) =>
    fields.map((field) => (
      <Form.Row key={field.id} columnCount={3} className="field-row">
        {/* Field 1: Key (Tên biến) */}
        <Input
          name={`key-${field.id}`}
          label="Key (Tên)"
          placeholder="e.g., alpha"
          value={field.key} // Kiểm soát component
          onChange={(e) =>
            handleFieldChange(section, field.id, "key", e.target.value)
          }
        />
        {/* Field 2: Value (Giá trị) */}
        <Input
          name={`value-${field.id}`}
          label="Value (Giá trị)"
          placeholder="e.g., 0.5"
          value={field.value} // Kiểm soát component
          onChange={(e) =>
            handleFieldChange(section, field.id, "value", e.target.value)
          }
        />

        {/* Nút Xóa (Giữ nguyên logic của bạn) */}
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

  // (12) Giữ nguyên: Nút 'Thêm trường' (đã đúng)
  const renderAddButton = (section) => (
    <Form.Row /* ... (code của bạn giữ nguyên) ... */>
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

  // (13) SỬA: Hàm handleSubmit (để gọi API)
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault(); // Ngăn form submit theo cách truyền thống

      // Chuẩn bị payload để gửi
      const payload = {
        name: name,
        endpoint: endpoint,
        project: project.id,
        input_data: fieldsToJson(inputFields),
        output_data: fieldsToJson(outputFields),
      };

      try {
        if (action === "updateTool") {
          // Chế độ "Sửa": Gọi API 'updateTool' với 'pk'
          await api.callApi(action, { params: { pk: tool.id }, data: payload });
        } else {
          // Chế độ "Thêm": Gọi API 'createTool'
          await api.callApi(action, { data: payload });
        }

        // (14) THÀNH CÔNG: Gọi callback 'onSubmit'
        // (Callback này sẽ đóng modal và fetchTools() như được định nghĩa trong ToolSettings.jsx)
        onSubmit();
      } catch (error) {
        console.error("Lỗi khi lưu Tool:", error);
        // (Tùy chọn: hiển thị lỗi này cho người dùng)
      }
    },
    // (15) THÊM: Dependencies
    // Thêm tất cả các state và prop liên quan
    [
      action,
      api,
      endpoint,
      inputFields,
      name,
      onSubmit,
      outputFields,
      project.id,
      tool,
    ]
  );

  // (16) SỬA: JSX của form
  // Chúng ta cần kiểm soát các trường chính
  return (
    <Form onSubmit={handleSubmit}>
      <Input type="hidden" name="project" value={project.id} />

      <Form.Row columnCount={1}>
        <Input
          name="name" // (Sửa: 'title' -> 'name' cho nhất quán với model)
          label="Name"
          placeholder="Enter a name"
          required
          value={name} // Kiểm soát component
          onChange={(e) => setName(e.target.value)} // Cập nhật state
        />
      </Form.Row>

      <Form.Row columnCount={1}>
        <Input
          name="endpoint" // (Sửa: 'url' -> 'endpoint')
          label="Backend URL (Endpoint)"
          required
          value={endpoint} // Kiểm soát component
          onChange={(e) => setEndpoint(e.target.value)} // Cập nhật state
        />
      </Form.Row>

      {/* Input Fields */}
      <Form.Row columnCount={1}>
        <Label text="Input Configuration (Key / Value)" large />
      </Form.Row>
      {renderFields(inputFields, "input")}
      {renderAddButton("input")}

      {/* Output Fields */}
      <Form.Row columnCount={1}>
        <Label text="Output Configuration (Key / Value)" large />
      </Form.Row>
      {renderFields(outputFields, "output")}
      {renderAddButton("output")}

      {/* Submit */}
      <Form.Row columnCount={1}>
        <Button variant="primary" type="submit">
          {/* (17) SỬA: Tên nút động */}
          {tool ? "Save Changes" : "Add Tool"}
        </Button>
      </Form.Row>
    </Form>
  );
};

export { ToolSettingsForm };
