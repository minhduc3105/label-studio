// (GHI CHÚ: File này có thể là 'Forms.js' hoặc 'ToolSettingsForm.jsx')

import { useState, useCallback, useEffect } from "react";
import { IconTrash } from "@humansignal/icons";
import { Button, Label, Typography } from "@humansignal/ui"; // Added Typography for better text
import { Form, Input } from "../../../components/Form";
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
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null); // 'success', 'error', or null
  const [validationMessage, setValidationMessage] = useState("");
  const [isValidated, setIsValidated] = useState(false);

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
      // If editing existing tool, mark as validated
      setIsValidated(true);
      setValidationStatus('success');
      setValidationMessage('Existing tool endpoint');
    } else {
      // Chế độ "Create" - Auto-fill with default values
      setName("");
      setEndpoint("");
      // Default input configuration
      const defaultInputFields = [
        { id: Date.now() + 1, key: "alpha", value: "0.4" },
        { id: Date.now() + 2, key: "num_epoch", value: "6" },
        { id: Date.now() + 3, key: "num_lfs_each", value: "4" },
        { id: Date.now() + 4, key: "hf_model", value: "bert-base-cased" },
        { id: Date.now() + 5, key: "api_key", value: "AIzaSyDrfS8dr2zW67_h9eHqIbcelyHNrnWBWWQ" },
      ];
      setInputFields(defaultInputFields);
      // Default output configuration (empty)
      setOutputFields([{ id: Date.now() + 100, key: "", value: "" }]);
      // Reset validation for new tool
      setIsValidated(false);
      setValidationStatus(null);
      setValidationMessage("");
    }
  }, [tool]);

  // Reset validation when endpoint or input fields change
  useEffect(() => {
    if (!tool) {
      // Only reset validation for new tools when endpoint changes
      setIsValidated(false);
      setValidationStatus(null);
      setValidationMessage("");
    }
  }, [endpoint, tool]);

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

  // === HÀM VALIDATE API ===
  const handleValidateAPI = useCallback(async () => {
    if (!endpoint) {
      alert("Please enter an endpoint URL first.");
      return;
    }

    setIsValidating(true);
    setValidationStatus(null);
    setValidationMessage("");

    try {
      // Create test payload matching the expected format
      // The tool endpoint expects: { labels: [], data: [], metadata: null }
      const testPayload = {
        labels: ["test_label_1", "test_label_2"], // Sample labels for validation
        data: [
          {
            id: 0,
            data: "This is a validation test message",
            label: null,
            data_type: "text",
            image_base64: null
          }
        ],
        metadata: fieldsToJson(inputFields) // Send input configuration as metadata
      };

      // Test the endpoint with the payload
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });

      if (!resp.ok) {
        const text = await resp.text();
        let errorDetails = text;
        try {
          errorDetails = JSON.parse(text);
        } catch {}

        throw new Error(`API returned status ${resp.status}: ${typeof errorDetails === 'object' ? JSON.stringify(errorDetails) : errorDetails}`);
      }

      const result = await resp.json();

      // Validate response structure
      if (!result || typeof result !== 'object') {
        throw new Error("API response is not in valid JSON format");
      }

      // Check if response has the expected structure
      // Expected: Array of objects with 'id' and 'label' fields
      // OR: Object with 'data' field containing such array
      let dataArray = Array.isArray(result) ? result : result.data;
      
      if (!dataArray || !Array.isArray(dataArray)) {
        throw new Error("API response must be an array or contain a 'data' array field");
      }

      // Validate that at least one item in response has expected structure
      if (dataArray.length > 0) {
        const firstItem = dataArray[0];
        if (!firstItem.hasOwnProperty('id')) {
          throw new Error("Response items must contain 'id' field");
        }
        if (!firstItem.hasOwnProperty('label')) {
          throw new Error("Response items must contain 'label' field");
        }
      }

      // Success - API is valid and returns correct format
      setValidationStatus('success');
      setValidationMessage('✓ API endpoint validated successfully! Response format is correct.');
      setIsValidated(true);
    } catch (err) {
      setValidationStatus('error');
      const errorMsg = err.message || 'Unknown error occurred';
      setValidationMessage(`✗ Validation failed: ${errorMsg}`);
      setIsValidated(false);
      console.error("API Validation Error:", err);
    } finally {
      setIsValidating(false);
    }
  }, [endpoint, inputFields]);

  // === HÀM SUBMIT (GỌI API) ===
  const handleSubmit = useCallback(async () => {
    if (!name || !endpoint) {
      alert("Name và Endpoint là bắt buộc.");
      return;
    }

    // Check if API has been validated (skip for edit mode)
    if (!tool && !isValidated) {
      alert("Please validate the API endpoint before submitting.");
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
    isValidated,
  ]);

  // === PHẦN RENDER (JSX) ===
  return (
    <div className="custom-tool-form" style={{ padding: "1.5rem 0" }}>
      {/* Name Field */}
      <Form.Row columnCount={1} style={{ marginBottom: "1.5rem" }}>
        <Input
          name="name"
          label="Tool Name"
          placeholder="e.g., AG News Classification"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ fontSize: "14px" }}
        />
      </Form.Row>

      {/* Endpoint Field */}
      <Form.Row columnCount={1} style={{ marginBottom: "1rem" }}>
        <Input
          name="endpoint"
          label="Backend URL (Endpoint)"
          placeholder="e.g., http://localhost:8000/api/tool"
          required
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          style={{ fontSize: "14px" }}
        />
        <Typography 
          variant="body" 
          size="small" 
          className="text-neutral-content-subtler"
          style={{ marginTop: "0.5rem", fontSize: "13px" }}
        >
          Enter the URL where your labeling tool backend is hosted.
        </Typography>
      </Form.Row>

      {/* Validation Button and Status */}
      <Form.Row 
        columnCount={1} 
        style={{ 
          marginBottom: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Button
            variant="secondary"
            look="outlined"
            onClick={handleValidateAPI}
            disabled={isValidating || !endpoint}
            aria-label="Validate API"
            style={{ minWidth: "140px" }}
          >
            {isValidating ? "Validating..." : "🔍 Validate API"}
          </Button>
          
          {validationStatus && (
            <div
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                backgroundColor: validationStatus === 'success' 
                  ? 'rgba(16, 185, 129, 0.1)' 
                  : 'rgba(239, 68, 68, 0.1)',
                color: validationStatus === 'success' ? '#059669' : '#dc2626',
                border: `1px solid ${validationStatus === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              {validationMessage}
            </div>
          )}
        </div>

        {!tool && !isValidated && (
          <Typography 
            variant="body" 
            size="small" 
            style={{ 
              fontSize: "12px", 
              color: "#f59e0b",
              padding: "0.5rem 0.75rem",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              borderRadius: "6px",
              border: "1px solid rgba(245, 158, 11, 0.3)",
            }}
          >
            ⚠️ You must validate the API endpoint before creating the tool
          </Typography>
        )}
      </Form.Row>

      {/* Hidden sections - configuration is auto-filled */}
      <div style={{ display: "none" }}>
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
      </div>

      {/* Configuration Info */}
      <div 
        style={{
          padding: "1rem 1.25rem",
          backgroundColor: "rgba(59, 130, 246, 0.05)",
          borderRadius: "8px",
          marginBottom: "2rem",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderLeft: "4px solid #3b82f6"
        }}
      >
        <Typography 
          variant="body" 
          size="small"
          className="text-neutral-content-subtler"
          style={{ fontSize: "13px", lineHeight: "1.5", color: "#64748b" }}
        >
          Integration by iSE Research Lab - Connect every tool to automate labeling workflows with pre-configured settings...
        </Typography>
      </div>

      {/* Submit Button */}
      <Form.Row
        columnCount={1}
        style={{ marginTop: "2rem", justifyContent: "flex-end", gap: "0.75rem", display: "flex" }}
      >
        <Button
          variant="primary"
          look="filled"
          onClick={handleSubmit}
          disabled={!tool && !isValidated}
          aria-label={tool ? "Save Changes" : "Add Tool"}
          style={{ 
            minWidth: "120px",
            opacity: (!tool && !isValidated) ? 0.5 : 1,
            cursor: (!tool && !isValidated) ? 'not-allowed' : 'pointer'
          }}
          title={(!tool && !isValidated) ? "Please validate API first" : ""}
        >
          {tool ? "Save Changes" : "Add Tool"}
        </Button>
      </Form.Row>
    </div>
  );
};
