"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import logging
import requests
import xml.etree.ElementTree as ET
import base64
import os
from django.conf import settings
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
        target_data_key = None
        try:
            parsed_config = project.get_parsed_config() or {}
            for key, info in parsed_config.items():
                inputs = info.get('input', [])
                if inputs:
                    for inp in inputs:
                        val = inp.get('value', '')
                        if val.startswith('$'):
                            target_data_key = val[1:]
                            break
                if target_data_key:
                    break
        except Exception:
            pass

        
        def _process_task_data(task):
            data_obj = getattr(task, "data", {}) or {}
            entry = {"id": task.id}
            
            # Lấy content gốc
            content = None
            if target_data_key and target_data_key in data_obj:
                content = data_obj[target_data_key]
            elif data_obj:
                content = next(iter(data_obj.values()), None)

            # Khởi tạo giá trị mặc định (cho trường hợp là Text)
            entry["data"] = content if content else ""
            entry["image_base64"] = None 
            entry["data_type"] = "text" # Gắn nhãn loại dữ liệu để Tool dễ xử lý

            # [LOGIC PHÂN LOẠI & XỬ LÝ ẢNH]
            # Kiểm tra: Content có phải string và có bắt đầu bằng đường dẫn media của Label Studio không?
            # Mặc định MEDIA_URL là '/data/'
            media_url = getattr(settings, 'MEDIA_URL', '/data/')
            
            if isinstance(content, str) and content.startswith(media_url):
                # ==> ĐÂY LÀ FILE (ẢNH/AUDIO)
                entry["data_type"] = "file"
                
                # 1. Chuyển đổi path URL sang path hệ thống
                # Vd: /data/upload/1/abc.jpg -> /var/www/label-studio/data/upload/1/abc.jpg
                relative_path = content.replace(media_url, '', 1)
                media_root = getattr(settings, 'MEDIA_ROOT', '')
                real_file_path = os.path.join(media_root, relative_path)

                # 2. Gán tên file vào 'data' (Theo yêu cầu của bạn)
                entry["data"] = os.path.basename(real_file_path)

                # 3. Đọc file và Encode Base64
                if os.path.exists(real_file_path):
                    try:
                        with open(real_file_path, "rb") as f:
                            encoded = base64.b64encode(f.read()).decode('utf-8')
                            entry["image_base64"] = encoded
                    except Exception as e:
                        logger.error(f"Failed to encode file {real_file_path}: {e}")
                else:
                    # File không tồn tại trên ổ cứng (có thể là link S3 hoặc lỗi)
                    # Giữ nguyên content gốc trong data để debug
                    entry["data"] = content 
            
            return entry


        qs = Task.objects.filter(project=project).order_by("id")
        if selected_ids and isinstance(selected_ids, list) and len(selected_ids) > 0:
            qs = qs.filter(id__in=selected_ids)
        elif limit:
            qs = qs[:limit]

        final_list = []
        for t in qs:
            entry = _process_task_data(t)
            
            # Logic lấy Label (Giữ nguyên)
            label_value = None
            if t.is_labeled:
                annotation = t.annotations.last()
                if annotation and annotation.result:
                    for res in annotation.result:
                        if res.get('type') == 'choices':
                            try:
                                choices = res.get('value', {}).get('choices', [])
                                if choices: label_value = choices[0]; break 
                            except: continue
            
            entry["label"] = label_value 
            final_list.append(entry)

        return final_list

    
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

    def update_tasks_with_labels(self, api_response, project, user, tool_name=None):
        updated_count = 0
        updated_task_ids = []
        from_name, to_name, tag_type, valid_choices = self._get_labeling_config_details(project)

        if not from_name or not to_name:
            logger.error("Labeling config details not found or unsupported.")
            return {"updated": updated_count, "skipped": 0}
            
        items_to_label = api_response
        if isinstance(items_to_label, dict) and 'data' in items_to_label:
            items_to_label = items_to_label['data']
        
        failed_ids = []

        for item in items_to_label:
            task_id = item.get('id')
            label = item.get("label")

            if not task_id or not label:
                continue
                
            # Lấy các thông tin phụ (ngoài id, label)
            more_info_data = item.copy()
            [more_info_data.pop(k, None) for k in ["id", "label", "data"]]

            if valid_choices and label not in valid_choices:
                failed_ids.append({"id": task_id, "reason": f"Invalid label: {label}"})
                continue

            try:
                task = Task.objects.get(id=task_id, project=project)
                
                # --- [PHẦN SỬA ĐỔI QUAN TRỌNG] ---
                # Lấy data hiện tại của Task (nếu chưa có thì là dict rỗng)
                current_data = task.data if task.data else {}
                data_changed = False

                # 1. Merge thông tin phụ từ Tool trả về (nếu có)
                if more_info_data:
                    current_data.update(more_info_data)
                    data_changed = True

                # 2. Lưu tên Tool trực tiếp vào JSON data
                if tool_name:
                    current_data['labeled_by_tool'] = tool_name
                    data_changed = True

                # 3. Chỉ lưu xuống DB nếu có sự thay đổi
                if data_changed:
                    task.data = current_data
                    task.save(update_fields=['data'])
                # -----------------------------------

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
                    defaults={
                        'result': result_json,
                        'was_cancelled': False,
                    }
                )
                updated_count += 1
                updated_task_ids.append(task_id)
            except Exception as e:
                failed_ids.append(task_id)
                logger.error(f"Failed label task {task_id}: {e}")
        
        return {'updated': updated_count, 'failed': failed_ids, "updated_tasks_id": updated_task_ids}
    
    def _build_payload(self, tool, project, limit=100000, selected_ids=None):

        _, _, _, valid_choices = self._get_labeling_config_details(project)

        label_list = valid_choices if valid_choices else []

        input_data = tool.input_data or {}
        if isinstance(input_data, list):
            return input_data, None
        
        try:
            task_list = self._collect_tasks_from_project(
                project,
                limit=limit,
                selected_ids=selected_ids
            )
        except Exception:
            task_list = []
        
        payload = {
            "labels": label_list,
            "data": task_list,
            "metadata": None
        }
        return payload, None



    def post(self, request, *args, **kwargs):
        tool = self.get_object() 
        project = tool.project

        selected_ids = request.data.get('selected_tasks_ids', [])
        logger.info(f"List selected {selected_ids}")
        
        try:
            endpoint_url = tool.endpoint
            if not endpoint_url or not endpoint_url.startswith(('http://', 'https://')):
                return Response({'error': 'Invalid tool endpoint URL'}, status=400)
            
            payload, _ = self._build_payload(tool, project, selected_ids=selected_ids)

            logger.info(f"Payload: {payload}")

            headers = {'Content-Type': 'application/json'}
            logger.info(f'Calling tool {tool.id}: {endpoint_url}')
            
            resp = requests.post(
                endpoint_url, 
                json=payload, 
                timeout=30,
                headers=headers
            )
            resp.raise_for_status()

            logger.info(f"Response: {resp}")

            try:
                external_output = resp.json()
            except ValueError:
                external_output = resp.text

            tool_name_str = getattr(tool, 'title', getattr(tool, 'name', f'Tool {tool.id}'))

            update_summary = self.update_tasks_with_labels(
                external_output,
                project,
                request.user,
                tool_name=tool_name_str
            )

            return Response({
                "status": "success",
                "data": external_output,
                "auto_label_summary": update_summary
            }
                , status=status.HTTP_200_OK)

        except requests.exceptions.RequestException as e:
            logger.error(f'Tool request failed: {e}')
            return Response({'error': 'Failed to call tool', 'details': str(e)}, status=502)
        except Exception as e:
            logger.error(f'Tool execution error: {e}', exc_info=True)
            return Response({'error': 'Internal server error', 'details': str(e)}, status=500)  