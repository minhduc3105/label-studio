# D:\ForStudy\label-studio\label_studio\tools\serializers.py
from rest_framework import serializers
from .models import Tool # (Import từ model "cục bộ")

class ToolSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tool
        fields = ('id', 'name', 'project', 'endpoint', 'input_data', 'output_data')