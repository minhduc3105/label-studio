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

    def _collect_tasks_from_project(self, project, limit=None, selected_ids=None):
        """
        Thu thập task từ project.
        - Tự động phát hiện trường dữ liệu (Text/Image/Audio).
        - Hỗ trợ lọc theo danh sách ID được chọn (Selected Tasks).
        """
        
        # --- 1. TỰ ĐỘNG PHÁT HIỆN DATA KEY TỪ CONFIG ---
        target_data_key = None
        try:
            parsed_config = project.get_parsed_config() or {}
            for key, info in parsed_config.items():
                inputs = info.get('inputs', [])
                if inputs:
                    for inp in inputs:
                        val = inp.get('value', '')
                        if val.startswith('$'):
                            target_data_key = val[1:] # Ví dụ: '$image' -> 'image'
                            break
                if target_data_key:
                    break
        except Exception:
            pass 

        # Helper: Trích xuất dữ liệu của 1 task
        def _task_entry(task):
            data = getattr(task, "data", {}) or {}
            entry = {"id": task.id}
            
            content = None
            # Ưu tiên 1: Key chuẩn từ config
            if target_data_key and target_data_key in data:
                content = data[target_data_key]
            # Ưu tiên 2: Fallback (lấy value đầu tiên)
            elif data:
                content = next(iter(data.values()), None)

            if content is not None:
                entry["text"] = content 
            return entry

        # --- 2. QUERY VÀ LỌC (SELECTED TASKS) ---
        qs = Task.objects.filter(project=project).order_by("id")
        
        # [QUAN TRỌNG] Nếu có danh sách ID được chọn, chỉ lấy những task đó
        if selected_ids and len(selected_ids) > 0:
            qs = qs.filter(id__in=selected_ids)

        labeled_qs = qs.filter(is_labeled=True)
        unlabeled_qs = qs.filter(is_labeled=False)

        # Chỉ áp dụng limit nếu KHÔNG chọn cụ thể (chọn cụ thể thì phải lấy hết)
        if limit and not selected_ids:
            labeled_qs = labeled_qs[:limit]
            unlabeled_qs = unlabeled_qs[:limit]

        # --- 3. XỬ LÝ DANH SÁCH LABELED ---
        labeled = []
        for t in labeled_qs:
            entry = _task_entry(t)
            
            label_value = None
            annotation = t.annotations.last() # Lấy annotation mới nhất
            
            if annotation and annotation.result:
                for res in annotation.result:
                    # Hỗ trợ cả Image & Text classification (Type: Choices)
                    if res.get('type') == 'choices':
                        try:
                            choices = res.get('value', {}).get('choices', [])
                            if choices:
                                label_value = choices[0]
                                break 
                        except Exception:
                            continue
            
            if label_value is not None:
                entry["label"] = label_value
            
            labeled.append(entry)

        # --- 4. XỬ LÝ DANH SÁCH UNLABELED ---
        unlabeled = [_task_entry(t) for t in unlabeled_qs]

        # --- 5. LẤY METADATA LABELS ---
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
        
        return labeled, unlabeled, labels

    def _build_payload(self, tool, project, limit=100000, selected_ids=None):
        """
        Xây dựng payload để gửi đi. Nhận selected_ids từ post().
        """
        input_data = tool.input_data or {}
        payload = {}
        written_path = None

        # 1) Tool có sẵn data cứng
        if isinstance(input_data, dict) and ('labeled_data' in input_data or 'unlabeled_data' in input_data):
            payload['labeled_data'] = input_data.get('labeled_data', [])
            payload['unlabeled_data'] = input_data.get('unlabeled_data', [])
            payload['parameters'] = input_data.get('parameters', {})
            payload['labels'] = input_data.get('labels', [])
            return payload, None

        # 2) Load từ file (ít dùng)
        file_path = input_data.get('file_path') or input_data.get('json_path') or input_data.get('dataset_path')
        if file_path:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict):
                    # Return loaded data... (giữ nguyên logic cũ)
                    return loaded, file_path
            except Exception:
                pass

        # 3) [QUAN TRỌNG] Thu thập từ Project (truyền selected_ids vào)
        try:
            labeled, unlabeled, labels = self._collect_tasks_from_project(
                project, 
                limit=limit, 
                selected_ids=selected_ids # <--- TRUYỀN ID XUỐNG ĐÂY
            )
        except Exception:
            labeled, unlabeled, labels = [], [], []

        parameters = input_data.get('parameters', {})

        payload['labeled_data'] = labeled or []
        payload['unlabeled_data'] = unlabeled or []
        payload['parameters'] = parameters or {}
        payload['labels'] = labels or []

        # 4) Backup payload ra file (Optional logging)
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
        Chuẩn hóa output từ External Tool về format Label Studio hiểu được.
        Format: {"data": [{"id": 1, "label": "Cat"}, ...], "status": "success"}
        """
        # Case 1: Tool trả về đúng format chuẩn
        if isinstance(external_output, dict) and 'data' in external_output:
            return {"data": external_output['data'], "status": "success"}

        # Case 2: Tool trả về Dict {id: label}
        if isinstance(external_output, dict):
            mapped = []
            for k, v in external_output.items():
                try:
                    iid = int(k)
                except Exception:
                    iid = k
                mapped.append({"id": iid, "label": v})
            return {"data": mapped, "status": "success"}

        # Case 3: Tool trả về List Labels (map theo thứ tự unlabeled_data gửi đi)
        if isinstance(external_output, list):
            # Nếu list chứa dict sẵn {id:..., label:...}
            if len(external_output) and isinstance(external_output[0], dict) and 'id' in external_output[0]:
                return {"data": external_output, "status": "success"}
            
            # Nếu list chỉ chứa label string ["Cat", "Dog"] -> Map vào unlabeled_data
            unlabeled = payload.get('unlabeled_data', [])
            mapped = []
            for i, lbl in enumerate(external_output):
                if i < len(unlabeled):
                    mapped.append({"id": unlabeled[i].get('id', i), "label": lbl})
            return {"data": mapped, "status": "success"}

        return {"data": [], "status": "success"}
    
    def get_object(self):
        queryset = self.filter_queryset(self.get_queryset())
        lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
        assert lookup_url_kwarg in self.kwargs, (
            'Expected view %s to be called with a URL keyword argument named "%s".'
            % (self.__class__.__name__, lookup_url_kwarg)
        )
        obj = generics.get_object_or_404(queryset, **{self.lookup_field: self.kwargs[lookup_url_kwarg]})
        return obj
    
    def _get_labeling_config_details(self, project):
        try:
            label_project_xml = project.label_config
            root = ET.fromstring(label_project_xml)
            # Tìm thẻ có thuộc tính toName (Choice, Taxonomy...)
            control_tag = root.find(".//*[@toName]")

            if control_tag is not None:
                from_name = control_tag.attrib.get("name")
                to_name = control_tag.attrib.get("toName")
                tag_type = control_tag.tag.lower()

                # Chỉ hỗ trợ các tag phân loại
                if tag_type not in ("choices", "labels", "taxonomy", "hypertextlabels", "paragraphlabels"):
                    logger.warning(f"Unsupported tag type: {tag_type}")
                    return None, None, None, None
                
                valid_choices = []
                child_tag_name = "Choice" if tag_type == "choices" else "Label"
                
                for choice_elem in control_tag.findall(f".//{child_tag_name}"):
                    value = choice_elem.attrib.get("value")
                    if value:
                        valid_choices.append(value)

                if from_name and to_name:
                    return from_name, to_name, tag_type, valid_choices

            return None, None, None, None
        except Exception as e:
            logger.error(f"Error config details: {e}")
            return None, None, None, None

    def update_tasks_with_labels(self, api_response, project, user):
        """
        Tạo Annotation từ kết quả trả về của Tool.
        """
        from_name, to_name, tag_type, valid_choices = self._get_labeling_config_details(project)
        
        if not from_name:
            return {"error": "Config details not found"}
        
        items_to_label = api_response.get("data", [])
        updated_count = 0
        failed_ids = []

        for item in items_to_label:
            task_id = item.get("id")
            label = item.get("label")

            if not task_id or not label:
                continue

            # Validate label nếu có danh sách choices
            if valid_choices and label not in valid_choices:
                failed_ids.append({"id": task_id, "reason": f"Invalid label: {label}"})
                continue

            try:
                task = Task.objects.get(id=task_id, project=project)
                
                result_json = [{
                    "from_name": from_name,
                    "to_name": to_name,
                    "type": tag_type,
                    "value": { tag_type: [label] }
                }]

                Annotation.objects.update_or_create(
                    task=task, 
                    completed_by=user,
                    project=project,
                    defaults={'result': result_json, 'was_cancelled': False}
                )
                updated_count +=1
            except Exception as e:
                failed_ids.append(task_id)
                logger.error(f"Failed label task {task_id}: {e}")
            
        return {"updated": updated_count, "failed": failed_ids}

    def post(self, request, *args, **kwargs):
        tool = self.get_object() 
        project = tool.project

        # --- [QUAN TRỌNG] LẤY LIST TASK ĐƯỢC CHỌN TỪ FRONTEND ---
        selected_ids = request.data.get('selected_tasks_ids', [])
        
        try:
            endpoint_url = tool.endpoint
            if not endpoint_url or not endpoint_url.startswith(('http://', 'https://')):
                return Response({'error': 'Invalid tool endpoint URL'}, status=400)
            
            # Truyền selected_ids xuống hàm build payload
            payload, payload_file = self._build_payload(
                tool, 
                project, 
                selected_ids=selected_ids
            )

            headers = {'Content-Type': 'application/json'}
            logger.info(f'Calling tool {tool.id}: {endpoint_url}')
            
            # Gọi External ML Tool
            resp = requests.post(
                endpoint_url, 
                json=payload, 
                timeout=30,
                headers=headers
            )
            resp.raise_for_status()

            # Xử lý kết quả trả về
            try:
                external_output = resp.json()
            except ValueError:
                external_output = resp.text

            normalized = self._map_external_to_response(external_output, payload)

            # Tự động tạo Annotation nếu kết quả hợp lệ
            if isinstance(normalized, dict) and normalized.get('status') == 'success':
                update_summary = self.update_tasks_with_labels(
                    normalized, 
                    project, 
                    request.user
                )
                normalized['auto_label_summary'] = update_summary

            return Response(normalized, status=status.HTTP_200_OK)

        except requests.exceptions.RequestException as e:
            logger.error(f'Tool request failed: {e}')
            return Response({'error': 'Failed to call tool', 'details': str(e)}, status=502)
        except Exception as e:
            logger.error(f'Tool execution error: {e}', exc_info=True)
            return Response({'error': 'Internal server error', 'details': str(e)}, status=500)