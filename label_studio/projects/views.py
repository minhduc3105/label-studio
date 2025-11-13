"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import logging
import requests

from django.contrib.auth.decorators import login_required
from django.shortcuts import render, get_object_or_404

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.response import Response

logger = logging.getLogger(__name__)


@login_required
def project_list(request):
    return render(request, 'projects/list.html')


@login_required
def project_settings(request, pk, sub_path):
    return render(request, 'projects/settings.html')

