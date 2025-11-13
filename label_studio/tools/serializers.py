"""This file and its contents are licensed under the Apache License 2.0."""
from rest_framework import serializers
from .models import Tool


class ToolSerializer(serializers.ModelSerializer):
    project_title = serializers.CharField(source='project.title', read_only=True)
    
    class Meta:
        model = Tool
        fields = [
            'id',
            'name',
            'endpoint',
            'input_data',
            'output_data',
            'project',
            'project_title',
        ]
        read_only_fields = ['id', 'project_title']