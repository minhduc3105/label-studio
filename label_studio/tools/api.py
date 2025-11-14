"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import logging
import requests
import xml.etree.ElementTree as ET
from django.utils.decorators import method_decorator
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
from drf_spectacular.types import OpenApiTypes
from rest_framework import generics, status
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from django.conf import settings
import json
import tempfile
import os
import time
from tasks.models import Task, Annotation
 

# Removed: from core.permissions import ViewClassPermission, all_permissions
# Removed: from core.mixins import GetParentObjectMixin
from projects.models import Project
from .models import Tool
from .serializers import ToolSerializer

logger = logging.getLogger(__name__)


VALID_CONTROL_TAGS = {
    "labels", "hypertextlabels", "paragraphlabels", "rectangle", "keypoint", 
    "polygon", "brush", "bitmask", "ellipse", "magicwand", "rectanglelabels", 
    "keypointlabels", "polygonlabels", "vector", "vectorlabels", "brushlabels", 
    "bitmasklabels", "ellipselabels", "timeserieslabels", "timelinelabels", 
    "choices", "datetime", "number", "taxonomy", "textarea", "rating", 
    "pairwise", "videorectangle", "ranker", "custominterface"
    }


@method_decorator(
    name='get',
    decorator=extend_schema(
        tags=['Tools'],
        summary='Get tools list',
        description='Retrieve a list of tools for a specific project.',
        parameters=[
            OpenApiParameter(name='project', type=OpenApiTypes.INT, location='query', description='Project ID'),
        ],
        responses={
            '200': OpenApiResponse(
                description='Tools list',
                response=ToolSerializer(many=True),
            )
        },
        extensions={
            'x-fern-sdk-group-name': 'tools',
            'x-fern-sdk-method-name': 'list',
            'x-fern-audiences': ['public'],
        },
    )
)
@method_decorator(
    name='post',
    decorator=extend_schema(
        tags=['Tools'],
        summary='Create tool',
        description='Create a new tool for a project.',
        request={'application/json': ToolSerializer},
        responses={
            '201': OpenApiResponse(
                description='Created tool',
                response=ToolSerializer,
            )
        },
        extensions={
            'x-fern-sdk-group-name': 'tools',
            'x-fern-sdk-method-name': 'create',
            'x-fern-audiences': ['public'],
        },
    )
)
class ToolListAPI(generics.ListCreateAPIView):
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    serializer_class = ToolSerializer
    # Removed: permission_required = ViewClassPermission(...)

    def get_queryset(self):
        project_id = self.request.query_params.get('project')
        if not project_id:
            return Tool.objects.none()
        try:
            project = Project.objects.get(pk=project_id)
        except (Project.DoesNotExist, ValueError):
            return Tool.objects.none()
        return Tool.objects.filter(project=project)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        project_id = self.request.data.get('project')
        if project_id:
            try:
                context['project'] = Project.objects.get(pk=project_id)
            except Project.DoesNotExist:
                pass
        return context

    def perform_create(self, serializer):
        project_id = self.request.data.get('project')
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            # Removed: PermissionDenied
            raise ValidationError({'project': 'Project does not exist.'})
        # Removed: project.has_permission(...) check
        serializer.save(project=project)


@method_decorator(
    name='get',
    decorator=extend_schema(
        tags=['Tools'],
        summary='Get tool',
        description='Retrieve a specific tool by ID.',
        parameters=[
            OpenApiParameter(name='id', type=OpenApiTypes.INT, location='path', description='Tool ID'),
        ],
        responses={
            '200': OpenApiResponse(
                description='Tool details',
                response=ToolSerializer,
            )
        },
        extensions={
            'x-fern-sdk-group-name': 'tools',
            'x-fern-sdk-method-name': 'get',
            'x-fern-audiences': ['public'],
        },
    )
)
@method_decorator(
    name='patch',
    decorator=extend_schema(
        tags=['Tools'],
        summary='Update tool',
        description='Update a tool.',
        request={'application/json': ToolSerializer},
        responses={
            '200': OpenApiResponse(
                description='Updated tool',
                response=ToolSerializer,
            )
        },
        extensions={
            'x-fern-sdk-group-name': 'tools',
            'x-fern-sdk-method-name': 'update',
            'x-fern-audiences': ['public'],
        },
    )
)
@method_decorator(
    name='delete',
    decorator=extend_schema(
        tags=['Tools'],
        summary='Delete tool',
        description='Delete a tool.',
        extensions={
            'x-fern-sdk-group-name': 'tools',
            'x-fern-sdk-method-name': 'delete',
            'x-fern-audiences': ['public'],
        },
    )
)
class ToolAPI(generics.RetrieveUpdateDestroyAPIView):
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    serializer_class = ToolSerializer
    queryset = Tool.objects.all()
    # Removed: permission_required = ViewClassPermission(...)

    def get_object(self):
        obj = super().get_object()
        # Removed: project.has_permission(...) checks
        return obj

    def patch(self, request, *args, **kwargs):
        return super().patch(request, *args, **kwargs)

    def delete(self, request, *args, **kwargs):
        return super().delete(request, *args, **kwargs)


@method_decorator(
    name='post',
    decorator=extend_schema(
        tags=['Tools'],
        summary='Run tool',
        description='Execute a tool endpoint and return the result.',
        parameters=[
            OpenApiParameter(name='id', type=OpenApiTypes.INT, location='path', description='Tool ID'),
        ],
        responses={
            '200': OpenApiResponse(description='Tool execution result', response={'type': 'object'}),
            '504': OpenApiResponse(description='Tool endpoint timed out'),
            '502': OpenApiResponse(description='Tool endpoint error'),
            '500': OpenApiResponse(description='Internal server error'),
        },
        extensions={
            'x-fern-sdk-group-name': 'tools',
            'x-fern-sdk-method-name': 'run',
            'x-fern-audiences': ['public'],
        },
    )
)
class ToolRunAPI(generics.GenericAPIView):
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    serializer_class = ToolSerializer
    queryset = Tool.objects.all()
    # Removed: permission_required = ViewClassPermission(POST=...)

    def _collect_tasks_from_project(self, project, limit=None):
        """
        Collect labeled and unlabeled task summaries from project.
        Returns (labeled_list, unlabeled_list, labels_list).
        Each item: {'id': <task.id>, 'text': '<text field>'}
        """
        def _task_entry(task):
            # Hàm này được giữ nguyên, chỉ lấy id và text
            data = getattr(task, "data", {}) or {}
            text = data.get("text") or data.get("content") or data.get("sentence") or next((v for k, v in data.items()), None)
            entry = {"id": task.id}
            if text is not None:
                entry["text"] = text
            return entry

        qs = Task.objects.filter(project=project).order_by("id")
        labeled_qs = qs.filter(is_labeled=True)
        unlabeled_qs = qs.filter(is_labeled=False)

        if limit:
            labeled_qs = labeled_qs[:limit]
            unlabeled_qs = unlabeled_qs[:limit]

        # --- THAY ĐỔI NẰM Ở ĐÂY ---
        # Bỏ dòng cũ: labeled = [_task_entry(t) for t in labeled_qs]
        
        # MỚI: Xây dựng 'labeled' data bằng một vòng lặp for
        # để chúng ta có thể thêm logic lấy 'label'
        labeled = []
        for t in labeled_qs:
            # 1. Lấy thông tin cơ bản (id, text) bằng hàm helper
            entry = _task_entry(t)
            
            # 2. Thêm logic để tìm 'label' từ annotation
            label_value = None
            try:
                # Giả định: Lấy annotation đầu tiên/gần nhất của task
                annotation = t.annotations.first() 
                
                # Giả định: annotation.result là một list
                # và label nằm trong [0]['value']['choices'][0]
                if annotation and annotation.result:
                    for res in annotation.result:
                        # Tìm 'result' đầu tiên có kiểu 'choices'
                        if res.get('type') == 'choices' and 'value' in res and 'choices' in res['value']:
                            label_value = res['value']['choices'][0]
                            break # Đã tìm thấy label
            except Exception:
                label_value = None # An toàn nếu cấu trúc khác
            
            # 3. Thêm label vào entry nếu tìm thấy
            if label_value is not None:
                entry["label"] = label_value
            
            labeled.append(entry)
        # --- KẾT THÚC THAY ĐỔI ---

        # Giữ nguyên logic cho 'unlabeled' vì nó không cần 'label'
        unlabeled = [_task_entry(t) for t in unlabeled_qs]

        # ... (Phần còn lại của hàm để lấy 'labels' list giữ nguyên) ...
        labels = []
        try:
            if hasattr(project, "summary") and project.summary and getattr(project.summary, "created_labels", None):
                for v in project.summary.created_labels.values():
                    labels.extend(list(v.keys()))
            if not labels and hasattr(project, "get_parsed_config"):
                parsed = project.get_parsed_config() or {}
                for _, tag in (parsed.items() if isinstance(parsed, dict) else []):
                    for lbl in tag.get("labels", []):
                        labels.append(lbl)
        except Exception:
            labels = []

        labels = list(dict.fromkeys([str(l) for l in labels]))
        print("Labeled", labeled)
        print("Unlabeled", unlabeled)
        return labeled, unlabeled, labels

    def _build_payload(self, tool, project, limit=100000):
        """
        Build payload to send to external endpoint.
        Priority:
         1) use tool.input_data if contains labeled/unlabeled
         2) load from file path declared in tool.input_data
         3) collect from project via _collect_tasks_from_project
        Returns tuple (payload_dict, written_filepath_or_None).
        """
        input_data = tool.input_data or {}
        payload = {}
        written_path = None

        # 1) tool-provided payload
        if isinstance(input_data, dict) and ('labeled_data' in input_data or 'unlabeled_data' in input_data):
            payload['labeled_data'] = input_data.get('labeled_data', [])
            payload['unlabeled_data'] = input_data.get('unlabeled_data', [])
            payload['parameters'] = input_data.get('parameters', {})
            payload['labels'] = input_data.get('labels', [])
            return payload, None

        # 2) file path in tool.input_data
        file_path = input_data.get('file_path') or input_data.get('json_path') or input_data.get('dataset_path')
        if file_path:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict) and ('labeled_data' in loaded or 'unlabeled_data' in loaded):
                    payload['labeled_data'] = loaded.get('labeled_data', [])
                    payload['unlabeled_data'] = loaded.get('unlabeled_data', [])
                    payload['parameters'] = loaded.get('parameters', input_data.get('parameters', {}))
                    payload['labels'] = loaded.get('labels', input_data.get('labels', []))
                    return payload, file_path
            except Exception:
                pass

        # 3) collect from project using helper
        try:
            labeled, unlabeled, labels = self._collect_tasks_from_project(project, limit=limit)
        except Exception:
            labeled, unlabeled, labels = [], [], []

        parameters = input_data.get('parameters', {})

        payload['labeled_data'] = labeled or []
        payload['unlabeled_data'] = unlabeled or []
        payload['parameters'] = parameters or {}
        payload['labels'] = labels or []

        # 4) write payload to temp file for record (optional)
        try:
            tmpdir = getattr(settings, 'MEDIA_ROOT', None) or tempfile.gettempdir()
            filename = f"tool_{tool.id}_payload_{int(time.time())}.json"
            path = os.path.join(tmpdir, filename)
            with open(path, 'w', encoding='utf-8') as wf:
                json.dump(payload, wf, ensure_ascii=False, indent=2)
            written_path = path
        except Exception:
            written_path = None

        return payload, written_path

    def _map_external_to_response(self, external_output, payload):
        """
        Normalize external_output into format:
        {"data": [{"id": <id>, "label": <label>}, ...], "status": "success"}
        """
        if isinstance(external_output, dict) and 'data' in external_output:
            return {"data": external_output['data'], "status": "success"}

        if isinstance(external_output, dict):
            mapped = []
            for k, v in external_output.items():
                try:
                    iid = int(k)
                except Exception:
                    iid = k
                mapped.append({"id": iid, "label": v})
            return {"data": mapped, "status": "success"}

        if isinstance(external_output, list):
            if len(external_output) and isinstance(external_output[0], dict) and 'id' in external_output[0]:
                return {"data": external_output, "status": "success"}
            unlabeled = payload.get('unlabeled_data', [])
            mapped = []
            for i, lbl in enumerate(external_output):
                if i < len(unlabeled):
                    mapped.append({"id": unlabeled[i].get('id', i), "label": lbl})
            return {"data": mapped, "status": "success"}

        return {"data": [], "status": "success"}
    
    def get_object(self):
        # Lấy pk từ kwargs, giống như cách get_object mặc định làm
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field

        assert lookup_url_kwarg in self.kwargs, (
            'Expected view %s to be called with a URL keyword argument named "%s". '
            'Fix your URL conf, or set the `.lookup_field` attribute on the view correctly.'
            % (self.__class__.__name__, lookup_url_kwarg)
        )

        # Lấy đối tượng
        obj = generics.get_object_or_404(queryset, **{self.lookup_field: self.kwargs[lookup_url_kwarg]})

        # !!! DÒNG CẦN BỎ QUA ĐÃ BỊ LOẠI:
        # self.check_object_permissions(self.request, obj) 
        # Phương thức này thường được gọi trong DRF, nhưng nếu không gọi ở đây, 
        # nó sẽ không kích hoạt api_permissions.py

        return obj
    

    
    def _get_labeling_config_details(self, project):
        try:
            label_project_xml = project.label_config
            root = ET.fromstring(label_project_xml)

            control_tag = root.find(".//*[@toName]")

            if control_tag is not None:
                from_name = control_tag.attrib.get("name")
                to_name = control_tag.attrib.get("toName")
                tag_type = control_tag.tag.lower()

                if tag_type not in VALID_CONTROL_TAGS:
                    logger.warring(
                        f"Found tag <{control_tag.tag}> but its type "
                        f"is not a recognized control tag for project {project.id}"

                    )
                    return None, None, None, None
                
                valid_choices = []
                child_tag_name = ""

                if tag_type == "choices":
                    child_tag_name = "Choice"
                elif tag_type in ("labels", "hypertextlabels", "paragraphlabels"):
                    child_tag_name = "Label"

                if child_tag_name:
                    for choice_elem in control_tag.findall(child_tag_name):
                        value = choice_elem.attrib.get("value")

                        if value:
                            valid_choices.append(value)
                    logger.info(f"Found valid choices for <{tag_type}>: {valid_choices}")

                if from_name and to_name:
                    return from_name, to_name, tag_type, valid_choices

            logger.warning(f"Could not find a valid <Choices> tag in project {project_id}")
            return None, None, None, None
        except Exception as e:
            logger.error(f"Error parsing label config for project {project.id}: {str(e)}")
            return None, None, None, None


    
    def update_tasks_with_labels(self, api_response, project, user):
        
        from_name, to_name, tag_type, valid_choices = self._get_labeling_config_details(project)
        
        if not from_name:
            logger.error(f"Cannot auto-label project {project.id}: config details not found")
            return {"error": "Labeling config mismatch or missing <Choices> tag."}
        
        needs_validation = tag_type in ("choices", "labels", "taxonomy", "hypertextlabels", "paragraphlabels")

        if needs_validation and not valid_choices:
            logger.warning(
                f"Project {project.id} uses <{tag_type}> but no valid <Choice>/<Label> "
                f"values were found in config. Auto-labeling may fail validation."
            )
        
        items_to_label = api_response.get("data", [])
        if not items_to_label:
            logger.error(f"No data found in API response to label.")
            return {"updated": 0, "failed": [], "error": "No data in response"}
        
        updated_count = 0
        failed_ids = []

        for item in items_to_label:
            task_id = item.get("id")
            label = item.get("label")

            if not task_id or not label:
                logger.warring(f"Skipping item, missing id or label: {item}")
                continue

            if needs_validation and label not in valid_choices:
                logger.warning(
                    f"Skipping task {task_id}: API label '{label}' is not a valid "
                    f"choice in project config. Valid choices are: {valid_choices}"
                )
                failed_ids.append({"id": task_id, "label": label, "reason": "Invalid label value"})
                continue
            try:
                task = Task.objects.get(id=task_id, project=project)

                result_json = [
                    {
                        "from_name": from_name,
                        "to_name": to_name,
                        "type": tag_type,
                        "value": {
                            tag_type: [label]
                        }
                    }
                ]

                Annotation.objects.update_or_create(
                    task=task, 
                    completed_by=user,
                    project=project,
                    defaults={
                        'result': result_json,
                        'was_cancelled': False
                    }
                )

                updated_count +=1
            except Task.DoesNotExist:
                logger.warning(f"Task with id {task_id} not found in project {project.id}")
                failed_ids.append(task_id)
            except Exception as e:
                logger.error(f"Failed to create annotation for task {task_id}: {str(e)}")
            
            summary = {
                "updated": updated_count,
                "failed_ids": failed_ids,
                "total_processed": len(items_to_label)
            }

            logger.info(f"Auto-labeling summary for project {project.id}: {summary}")

        return summary



    def post(self, request, *args, **kwargs):
        tool = self.get_object() 
        project = tool.project

        try:
            endpoint_url = tool.endpoint
            
            # Validate URL trước
            if not endpoint_url or not endpoint_url.startswith(('http://', 'https://')):
                logger.error(f'Tool {tool.id} has invalid endpoint: {endpoint_url}')
                return Response({'error': 'Invalid tool endpoint URL'}, status=400)
            
            payload, payload_file = self._build_payload(tool, project)
           # print(payload)

            # Thêm headers và error handling tốt hơn
            headers = {'Content-Type': 'application/json'}
            
            logger.info(f'Calling tool {tool.id} endpoint: {endpoint_url}')
            print(endpoint_url)
            resp = requests.post(
                endpoint_url, 
                json=payload, 
                timeout=30,
                headers=headers
            )

            # Kiểm tra status code
            resp.raise_for_status()

            try:
                external_output = resp.json()
            except ValueError:
                external_output = resp.text

            normalized = self._map_external_to_response(external_output, payload)

            if isinstance(external_output, dict):
                update_summary = self.update_tasks_with_labels(
                    external_output, 
                    project, 
                    request.user
                )
                logger.info(f"Auto-labeling sumary: {update_summary}")
            else:
                logger.waring(f"External output is not a dict, cannot auto-label")
                update_summary = {"error": "Invalid putput format from tool"}

            if isinstance(normalized, list):
                normalized['auto_label_summary'] = update_summary
                

            logger.debug(f'Tool {tool.id} executed successfully.')
            return Response(normalized, status=status.HTTP_200_OK)

        except requests.exceptions.Timeout:
            logger.warning(f'Tool {tool.id} endpoint timed out after 30s: {endpoint_url}')
            return Response({
                'error': 'Tool endpoint timed out',
                'endpoint': endpoint_url
            }, status=504)
        
        except requests.exceptions.ConnectionError as e:
            logger.error(f'Tool {tool.id} connection failed: {endpoint_url} - {str(e)}')
            return Response({
                'error': 'Cannot connect to tool endpoint',
                'details': str(e),
                'endpoint': endpoint_url
            }, status=502)
        
        except requests.exceptions.HTTPError as e:
            # Backend trả về lỗi HTTP (4xx, 5xx)
            logger.error(f'Tool {tool.id} HTTP error: {e.response.status_code} - {str(e)}')
            return Response({
                'error': f'Tool endpoint returned error: {e.response.status_code}',
                'details': e.response.text[:500]  # Giới hạn độ dài
            }, status=502)
        
        except requests.exceptions.RequestException as e:
            # Các lỗi requests khác
            logger.error(f'Tool {tool.id} request failed: {str(e)}')
            return Response({
                'error': 'Failed to call tool endpoint',
                'details': str(e)
            }, status=502)
        
        except Exception as e:
            logger.error(f'Tool {tool.id} execution error: {str(e)}', exc_info=True)
            return Response({
                'error': 'Internal server error',
                'details': str(e)
            }, status=500)