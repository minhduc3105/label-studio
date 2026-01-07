from minio import Minio
import os
import pandas as pd


client = Minio(
    "localhost:9000",
    access_key="admin",
    secret_key="password123",
    secure=False)

bucket_name = "test"

file_name = "test.png"
file_path = "C:/Users/This/Downloads/chart.png"

client.fput_object(bucket_name, file_name, file_path, content_type="image/png")

url = client.get_presigned_url(
    "GET", 
    bucket_name, 
    file_name)

print(f"Gửi link này cho đối tác: \n{url}")