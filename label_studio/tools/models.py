# D:\ForStudy\label-studio\label_studio\tools\models.py
from django.db import models
# (1) Import Project bằng tên dài (an toàn)
from projects.models import Project 

class Tool(models.Model):
    # (2) Dán code Model 'Tool' của bạn vào đây
    # (Lần này KHÔNG CẦN 'app_label' vì nó đã ở đúng app của nó)
    name = models.CharField(max_length=256, default="Unnamed", help_text="Name Tool")
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='tools')
    endpoint = models.URLField(max_length=2048, blank=False, null=False, help_text="Tool endpoint URL")
    input_data = models.JSONField(blank=True, null=True, default=dict, help_text="Input Configuration for Tool")
    output_data = models.JSONField(blank=True, null=True, default=dict, help_text="Output Configuration for Tool")
    color_data = models.CharField(max_length=7, default="#5CA5F3", blank=True, help_text="Color code represent Tool")

    def __str__(self): 
        return self.name
    
    def has_permission(self, user):
        return self.project.has_permission(user)
    
    class Meta:
        app_label = 'tools'
        ordering = ['id']