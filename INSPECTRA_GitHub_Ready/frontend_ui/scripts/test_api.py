import urllib.request
import uuid
import json

def test_inspect(file_path):
    boundary = uuid.uuid4().hex
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
    
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="image"; filename="{file_path}"\r\n'
        f'Content-Type: image/jpeg\r\n\r\n'
    ).encode('utf-8') + file_bytes + f'\r\n--{boundary}--\r\n'.encode('utf-8')
    
    req = urllib.request.Request(
        'http://localhost:3000/api/inspect',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
    )
    try:
        with urllib.request.urlopen(req) as res:
            data = json.loads(res.read().decode())
            print(f"[{file_path}] -> Verdict: {data.get('classification')}, Confidence: {data.get('confidence')}, Source: {data.get('source')}")
            print(f"    Explanation: {data.get('explanation')}")
    except urllib.error.HTTPError as e:
        print(f"[{file_path}] -> HTTP Error {e.code}: {e.read().decode()}")

if __name__ == '__main__':
    print("--- TESTING INSPECTRA API ---")
    test_inspect('public/samples/defect_free_steel_sheet.jpg')
    test_inspect('public/samples/steel_surface_longitudinal_crack.jpg')
    test_inspect('public/samples/insufficient_blur_lighting.jpg')
