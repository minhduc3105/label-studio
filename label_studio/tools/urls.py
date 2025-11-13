"""This file and its contents are licensed under the Apache License 2.0."""
from django.urls import path
from .api import ToolListAPI, ToolAPI, ToolRunAPI

app_name = 'tools'

urlpatterns = [
    # List and Create tools
    path('api/tools', ToolListAPI.as_view(), name='tool-list'),
    
    # Retrieve, Update, Delete tool
    path('api/tools/<int:pk>', ToolAPI.as_view(), name='tool-detail'),
    
    # Run tool endpoint
    path('api/tools/<int:pk>/run', ToolRunAPI.as_view(), name='tool-run'),
]