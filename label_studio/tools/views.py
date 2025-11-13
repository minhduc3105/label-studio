# D:\ForStudy\label-studio\label_studio\tools\views.py
import requests
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404

from .models import Tool
from .serializers import ToolSerializer
from projects.models import Project 

class ToolViewSet(viewsets.ModelViewSet):
    queryset = Tool.objects.all()
    serializer_class = ToolSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get('project')
        if not project_id:
            return queryset.none()
        try:
            project = get_object_or_404(Project, pk=project_id)
        except ValueError:
            return queryset.none()
        if not project.has_permission(self.request.user):
            return queryset.none()
        return queryset.filter(project=project)

    def perform_create(self, serializer):
        project_id = self.request.data.get('project')
        project = get_object_or_404(Project, pk=project_id)
        if not project.has_permission(self.request.user):
            raise PermissionDenied('Bạn không có quyền thực hiện hành động này trên project.')
        serializer.save(project=project)
        
    @action(detail=True, methods=['post'])
    def run(self, request, pk=None):
        tool = self.get_object()
        project = tool.project
        if not project.has_permission(self.request.user):
            raise PermissionDenied('Bạn không có quyền trên project này.')
        try:
            input_data = tool.input_data 
            endpoint_url = tool.endpoint
            response = requests.post(endpoint_url, json=input_data, timeout=10)
            response.raise_for_status() 
            external_output = response.json()
            return Response(external_output)
        except requests.exceptions.Timeout:
            return Response({'error': 'Tool endpoint timed out'}, status=504)
        except requests.exceptions.RequestException as e:
            return Response({'error': f'Failed to call tool: {str(e)}'}, status=502)
        except Exception as e:
            return Response({'error': str(e)}, status=500)