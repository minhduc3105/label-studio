"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import logging
import mimetypes
import requests
import xml.etree.ElementTree as ET
import base64
import os
import random
import colorsys
from django.conf import settings
from django.utils.decorators import method_decorator
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse
from drf_spectacular.types import OpenApiTypes
from rest_framework import generics, status
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from django.http import StreamingHttpResponse

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

def generate_distinct_light_color(existing_colors=None):
    """
    Sinh ra mã màu HEX ngẫu nhiên nhưng đảm bảo độ sáng cao (nền sáng)
    để chữ đen/nâu có thể nổi bật.
    """
    if existing_colors is None:
        existing_colors = []
    
    max_retries = 50
    for _ in range(max_retries):
        # 1. Random Hue (Màu sắc): 0.0 - 1.0 (Đại diện cho 0-360 độ)
        h = random.random()
        
        # 2. Random Saturation (Độ bão hòa): 0.2 - 0.5 (20% - 50%)
        # Giữ ở mức thấp để màu ra dạng Pastel (nhạt), không bị chói quá
        s = random.uniform(0.2, 0.5)
        
        # 3. Random Value (Độ sáng): 0.85 - 1.0 (85% - 100%)
        # Giữ ở mức cao để nền luôn sáng -> Chữ đen sẽ nổi
        v = random.uniform(0.85, 1.0)
        
        # Chuyển đổi từ HSV sang RGB
        r, g, b = colorsys.hsv_to_rgb(h, s, v)
        
        # Chuyển sang mã HEX (#RRGGBB)
        hex_color = '#%02x%02x%02x' % (int(r*255), int(g*255), int(b*255))
        
        # Kiểm tra trùng lặp
        if hex_color not in existing_colors:
            return hex_color
            
    # Fallback nếu random mãi vẫn trùng (hiếm khi xảy ra)
    return "#FFFFFF"

# ... Phần Decorator giữ nguyên ...
class ToolListAPI(generics.ListCreateAPIView):
    parser_classes = (JSONParser, FormParser, MultiPartParser)
    serializer_class = ToolSerializer

    # ... Phần get_queryset và get_serializer_context giữ nguyên ...
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
        existing_colors = list(Tool.objects.filter(project=project).values_list('color_data', flat=True))

        # 2. Sinh màu mới khác biệt và đảm bảo độ tương phản
        new_color = generate_distinct_light_color(existing_colors)
        serializer.save(project=project, color_data=new_color)


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

    def _encode_file(self, file_path):
        """
        Reads a local file and encodes it into a Base64 Data URI string.
        
        Args:
            file_path (str): Relative path to the file (e.g., "uploads/images/abc.jpg")
            
        Returns:
            str: Data URI string (e.g., "data:image/jpeg;base64,iVBORw...") or None if failed.
        """
        if not file_path or not isinstance(file_path, str):
            return None
        
        # Construct absolute system path based on Django settings
        media_root = getattr(settings, 'MEDIA_ROOT', '')
        clean_path = str(file_path)
        media_url = getattr(settings, 'MEDIA_URL', '/media/')
        
        # Remove media URL prefix if present to get the raw relative path
        if clean_path.startswith(media_url):
            clean_path = clean_path.replace(media_url, '', 1)

        full_path = os.path.join(media_root, clean_path)

        # Check if file exists on the server filesystem
        if not os.path.exists(full_path) or not os.path.isfile(full_path):
            return file_path # Return original string if file not found

        # Detect MIME type (e.g., image/png, audio/mp3)
        mime_type, _ = mimetypes.guess_type(full_path)
        if not mime_type:
            mime_type = 'application/octet-stream'

        try:
            # Read binary file and encode
            with open(full_path, "rb") as f:
                encoded_string = base64.b64encode(f.read()).decode('utf-8')
                return f"data:{mime_type};base64,{encoded_string}"
        except Exception as e:
            logger.error(f"Error encoding file {full_path}: {e}")
            return None

    def _get_project_mapping(self, project):
        """
        Parses Label Studio XML config to map variable names to database keys.
        This allows the API to handle multiple input types (e.g., Image + Text) generically.
        
        Returns:
            dict: Mapping of { 'ls_variable_name': 'ls_variable_name' }
            Example: {'image': 'image', 'caption': 'caption'}
        """
        mapping = {}
        try:
            parsed_config = project.get_parsed_config() or {}
            # Iterate through all control tags in the config
            for key, info in parsed_config.items():
                inputs = info.get('input', [])
                for inp in inputs:
                    val = inp.get('value', '')
                    # Look for variables starting with '$' (e.g., value="$image")
                    if val.startswith('$'):
                        ls_variable = val[1:] # Remove '$' prefix
                        mapping[ls_variable] = ls_variable
        except Exception as e:
            logger.warning(f"Mapping parse error: {e}")
        return mapping


    def _process_task_data(self, task, mapping):
        """
        Converts a Task model instance into a dictionary payload.
        Handles dynamic key mapping and automatically Base64 encodes file paths.
        """
        task_data = getattr(task, "data", {}) or {}
        dynamic_data = {}
        
        # Determine keys to process: use mapping if available, otherwise use all keys
        keys_to_process = mapping.keys() if mapping else task_data.keys()

        for ls_key in keys_to_process:
            # Map Label Studio key to Database key (defaulting to 1-to-1 mapping)
            db_key = mapping.get(ls_key, ls_key)
            value = task_data.get(db_key)
            
            processed_value = value
            
            # Logic: Automatically detect if the value is a file path and encode it
            if isinstance(value, str):
                lower_val = value.lower()
                media_url = getattr(settings, 'MEDIA_URL', '/media/')
                
                # List of supported extensions for encoding
                supported_extensions = ['.jpg', '.jpeg', '.png', '.mp3', '.wav', '.mp4', '.pdf']
                
                is_likely_file = (
                    lower_val.startswith(media_url) or 
                    any(lower_val.endswith(ext) for ext in supported_extensions)
                )
                
                if is_likely_file:
                    encoded = self._encode_file(value)
                    if encoded: 
                        processed_value = encoded
            
            dynamic_data[ls_key] = processed_value

        # Extract existing annotations (if any) to provide context/examples
        current_annotations = []
        if task.is_labeled:
            last_ann = task.annotations.last()
            if last_ann and last_ann.result:
                current_annotations.append({
                    "id": last_ann.id,
                    "result": last_ann.result
                })

        # Construct the final task entry
        return {
            "id": task.id,
            "data": dynamic_data,
            "annotations": current_annotations, # Using 'annotations' key standard
            "meta_info": {
                "created_at": str(task.created_at) if hasattr(task, 'created_at') else None,
            }
        }

    
    def get_object(self):
        return super().get_object()

    def _get_labeling_config_details(self, project):
        """
        Parses XML config to extract valid labels/choices.
        """
        try:
            label_project_xml = project.label_config
            root = ET.fromstring(label_project_xml)
            # Find the control tag that has a 'toName' attribute
            control_tag = root.find(".//*[@toName]")
            if control_tag is not None:
                from_name = control_tag.attrib.get("name")
                to_name = control_tag.attrib.get("toName")
                tag_type = control_tag.tag.lower()
                valid_choices = []
                child_tag_name = "Choice" if tag_type == "choices" else "Label"
                
                # Extract all values
                for choice_elem in control_tag.findall(f".//{child_tag_name}"):
                    val = choice_elem.attrib.get("value")
                    if val: valid_choices.append(val)
                    
                if from_name and to_name:
                    return from_name, to_name, tag_type, valid_choices
            return None, None, None, None
        except: return None, None, None, None

    def update_tasks_with_labels(self, api_response, project, user, tool_name=None):
        """
        Processes the standardized JSON response from the external tool and updates the database.
        
        This function acts as a "Universal Adapter" (Dumb Pipe):
        It receives a pre-formatted Label Studio 'result' JSON from the tool and saves it directly.
        It is agnostic to the data type (Image, Text, Audio, etc.).

        Args:
            api_response (list|dict): The JSON payload returned by the 3rd party tool.
            project (Project): The Label Studio project instance.
            user (User): The user (system/bot) assigned to these annotations.
            tool_name (str, optional): Name of the tool for tracking purposes.

        Returns:
            dict: Summary of the operation {'updated': int, 'failed': list, 'updated_tasks_id': list}
        """
        updated_count = 0
        updated_task_ids = []
        failed_ids = []
        
        # 1. Normalize Input (Handle both List and Dict formats)
        # Tools might return a direct list or a dict wrapping the results
        items_to_process = api_response
        if isinstance(api_response, dict):
            # Attempt to find the list under common keys like 'results' or 'dataset'
            items_to_process = api_response.get('results') or api_response.get('dataset') or []

        for item in items_to_process:
            task_id = item.get('id')
            
            # Extract core components
            result_json = item.get('result')  # Mandatory: The Label Studio compatible result
            metadata = item.get('metadata', {}) # Optional: Confidence scores, model versions, etc.
            
            if not task_id:
                continue
                
            # validation: Skip if the tool returned an error or empty result
            if not result_json:
                failed_ids.append({"id": task_id, "reason": "Empty result"})
                continue

            try:
                task = Task.objects.get(id=task_id, project=project)
                
                # ---------------------------------------------------------
                # STEP 2: Update Task Metadata (Non-visual data)
                # This helps in filtering tasks later (e.g., "Show me tasks with score < 0.5")
                # ---------------------------------------------------------
                current_data = task.data or {}
                data_changed = False
                
                # A. Merge new data if the tool modified the original input (e.g., corrected OCR text)
                if 'data' in item and isinstance(item['data'], dict):
                    current_data.update(item['data'])
                    data_changed = True
                
                # B. Store AI Model Metadata
                # Use a reserved key '__model_meta' to avoid conflicts with actual dataset columns
                if metadata:
                    current_data['__model_meta'] = metadata
                    data_changed = True
                
                # C. Track which tool performed the labeling
                if tool_name:
                    current_data['labeled_by'] = tool_name
                    data_changed = True
                    
                # Only hit the database if data actually changed
                if data_changed:
                    task.data = current_data
                    task.save(update_fields=['data'])

                # ---------------------------------------------------------
                # STEP 3: Create/Update Annotation (THE CORE LOGIC)
                # We inject the raw 'result_json' directly into the DB.
                # The Frontend handles rendering based on 'from_name'/'to_name' mapping.
                # ---------------------------------------------------------
                Annotation.objects.update_or_create(
                    task=task,
                    completed_by=user, # Usually the System Bot user
                    project=project,
                    defaults={
                        'result': result_json,  # <--- Magic happens here: Universal JSON storage
                        'was_cancelled': False,
                        'ground_truth': False,
                        # Automatically track how long the model took (if provided)
                        'lead_time': metadata.get('processing_time', 0)
                    }   
                )
                
                updated_count += 1
                updated_task_ids.append(task_id)

            except Task.DoesNotExist:
                failed_ids.append({"id": task_id, "reason": "Task not found in DB"})
            except Exception as e:
                logger.error(f"Error saving task {task_id}: {e}")
                failed_ids.append({"id": task_id, "reason": str(e)})

        return {
            'updated': updated_count, 
            'failed': failed_ids, 
            "updated_tasks_id": updated_task_ids
        }
    
    def _build_payload(self, tool, project, limit=100, selected_ids=None):
        """
        Constructs the Universal Payload containing labels, dataset, and metadata.
        """
        # Retrieve label configuration (choices/classes)
        _, _, _, valid_choices = self._get_labeling_config_details(project)
        label_list = valid_choices if valid_choices else []

        # If tool has static input data (e.g., prompt templates), return it directly
        if tool.input_data and isinstance(tool.input_data, list):
             return tool.input_data, None

        # A. Get Field Mapping
        mapping = self._get_project_mapping(project)

        # B. Query Tasks
        qs = Task.objects.filter(project=project).order_by("id")
        if selected_ids and isinstance(selected_ids, list) and len(selected_ids) > 0:
            qs = qs.filter(id__in=selected_ids)
        elif limit:
            qs = qs[:limit]

        # C. Process Tasks Loop
        task_list = []
        for t in qs:
            entry = self._process_task_data(t, mapping)
            
            # Fallback logic for simple label representation (Backward Compatibility)
            label_value = None
            if entry['annotations']:
                 for res in entry['annotations'][0]['result']:
                     if res.get('type') == 'choices':
                         try:
                             choices = res.get('value', {}).get('choices', [])
                             if choices: label_value = choices[0]; break
                         except: continue
            entry["label"] = label_value
            
            task_list.append(entry)

        # Final Payload Structure
        payload = {
            "labels": label_list,
            "data": task_list,
            "metadata": {"project_id": project.id}
        }
        return payload, None

    def _receive_webhook_stream(self, endpoint_url, tool, project, user, payload):
        """
        Receive and process streaming webhook data from external tool.
        Handles SSE (Server-Sent Events) format.
        
        Args:
            endpoint_url: URL of the external tool webhook
            tool: Tool instance
            project: Project instance
            user: User instance
            payload: Data to send to the webhook endpoint
            
        Returns:
            dict: Summary with updated/failed task counts
        """
        from_name, to_name, tag_type, valid_choices = self._get_labeling_config_details(project)
        
        if not from_name or not to_name:
            logger.error("Labeling config details not found or unsupported.")
            return {"updated": 0, "failed": [], "error": "Invalid labeling config"}
        
        tool_name = getattr(tool, 'title', getattr(tool, 'name', f'Tool {tool.id}'))
        updated_tasks = []
        failed_tasks = []
        
        try:
            # Make streaming request with payload
            headers = {'Content-Type': 'application/json'}
            with requests.post(endpoint_url, json=payload, stream=True, timeout=300, headers=headers) as response:
                response.raise_for_status()
                
                # Process SSE stream line by line
                for line in response.iter_lines():
                    if not line:
                        continue
                    
                    line = line.decode('utf-8').strip()
                    
                    # Parse SSE format: "data: {json}"
                    if line.startswith('data:'):
                        data_str = line[5:].strip()
                        
                        try:
                            event_data = json.loads(data_str)
                            
                            # Skip completion events
                            if event_data.get('event') == 'done':
                                logger.info(f"Webhook completed: {event_data}")
                                break
                            
                            # Process label result
                            if 'result' in event_data:
                                result = event_data['result']
                                task_id = result.get('id')
                                label = result.get('label')
                                
                                if not task_id or not label:
                                    continue
                                
                                # Validate label
                                if valid_choices and label not in valid_choices:
                                    failed_tasks.append({
                                        "id": task_id, 
                                        "reason": f"Invalid label: {label}"
                                    })
                                    continue
                                
                                # Get additional info
                                more_info_data = result.copy()
                                [more_info_data.pop(k, None) for k in ["id", "label", "data"]]
                                
                                try:
                                    task = Task.objects.get(id=task_id, project=project)
                                    
                                    # Update task data
                                    current_data = task.data if task.data else {}
                                    if more_info_data:
                                        current_data.update(more_info_data)
                                    current_data['labeled_by_tool'] = tool_name
                                    if 'data' in result:
                                        current_data['original_data'] = result['data']
                                    
                                    task.data = current_data
                                    task.save(update_fields=['data'])
                                    
                                    # Create annotation
                                    result_json = [{
                                        "from_name": from_name,
                                        "to_name": to_name,
                                        "type": tag_type,
                                        "value": {tag_type: [label]}
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
                                    
                                    updated_tasks.append(task_id)
                                    logger.info(f"Updated task {task_id} with label {label}")
                                    
                                except Task.DoesNotExist:
                                    failed_tasks.append({
                                        "id": task_id, 
                                        "reason": "Task not found"
                                    })
                                except Exception as e:
                                    failed_tasks.append({
                                        "id": task_id, 
                                        "reason": str(e)
                                    })
                                    logger.error(f"Failed to update task {task_id}: {e}")
                        
                        except json.JSONDecodeError as e:
                            logger.warning(f"Failed to parse SSE data: {data_str}")
                            continue
            
            return {
                "updated": len(updated_tasks),
                "updated_tasks_id": updated_tasks,
                "failed": failed_tasks
            }
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Webhook request failed: {e}")
            return {
                "updated": len(updated_tasks),
                "updated_tasks_id": updated_tasks,
                "failed": failed_tasks,
                "error": str(e)
            }

    def post(self, request, *args, **kwargs):
        tool = self.get_object() 
        project = tool.project
        selected_ids = request.data.get('selected_tasks_ids', [])
        
        try:
            endpoint_url = tool.endpoint
            if not endpoint_url:
                return Response({'error': 'Invalid endpoint'}, status=400)
            
            # Build Payload
            # NOTE: Using a small limit (e.g., 5) is recommended when using Base64 to avoid large payloads.
            payload, _ = self._build_payload(tool, project, limit=5, selected_ids=selected_ids) 

            logger.info(f"Generated Payload with {len(payload['data'])} tasks")

            # Send Request to External Tool
            headers = {'Content-Type': 'application/json'}
            resp = requests.post(
                endpoint_url, 
                json=payload, 
                timeout=60, # Extended timeout for Base64 processing
                headers=headers,
                stream=True
            )
            resp.raise_for_status()

            # Handle Response
            try:
                external_output = resp.json()
            except:
                external_output = resp.text

            # Update DB with results
            update_summary = self.update_tasks_with_labels(
                external_output,
                project,
                request.user,
                tool_name=getattr(tool, 'title', f'Tool {tool.id}')
            )

            return Response({
                "status": "success",
                "data": external_output,
                "auto_label_summary": update_summary
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f'Error: {e}', exc_info=True)
            return Response({'error': str(e)}, status=500)