"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import logging

from .models import Tool, Project
from .serializers import ToolSerializer
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, get_object_or_404

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied

logger = logging.getLogger(__name__)


@login_required
def project_list(request):
    return render(request, 'projects/list.html')


@login_required
def project_settings(request, pk, sub_path):
    return render(request, 'projects/settings.html')


class ToolViewSet(viewsets.ModelViewSet):
    queryset = Tool.objects.all()
    serializer_class = ToolSerializer
    permission_classes = [IsAuthenticated]


    
    def get_queryset(self):
        """Override to ensure users only see tools for projects they have access to"""
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
        """Override this function when create a new tool to ensure the user has permissions on the project they are trying to add tool to"""
        project_id = self.request.data.get('project')
        project = get_object_or_404(Project, pk=project_id)
        
        if not project.has_permission(self.request.user):
            raise PermissionDenied('You do not have permission to perform this action on the project.')
        serializer.save(project=project)