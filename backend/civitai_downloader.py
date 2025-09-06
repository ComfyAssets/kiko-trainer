#!/usr/bin/env python3
"""
CivitAI Model Downloader
Based on working reference implementation
"""
import os
import sys
import time
import json
import asyncio
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
from typing import Optional, Dict, Any, Callable
from functools import wraps

CHUNK_SIZE = 1638400  # 1.6MB chunks as in working implementation
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
API_BASE = 'https://civitai.com/api/v1'
MAX_RETRIES = 3
RETRY_DELAY = 5

class DownloadError(Exception):
    """Custom exception for download errors"""
    pass

class CivitAIDownloader:
    def __init__(self, token: Optional[str] = None, progress_callback: Optional[Callable] = None):
        self.token = token
        self.progress_callback = progress_callback
        self.cancel_event = None
        
    def set_cancel_event(self, event: asyncio.Event):
        """Set cancellation event for download"""
        self.cancel_event = event
        
    def _parse_civitai_url(self, url: str) -> Dict[str, Optional[int]]:
        """Extract model and version IDs from CivitAI URL"""
        parsed = urlparse(url)
        result = {'model_id': None, 'version_id': None}
        
        # Direct API download URL
        if '/api/download/models/' in url:
            match = url.split('/api/download/models/')[-1].split('?')[0]
            if match.isdigit():
                result['version_id'] = int(match)
                return result
        
        # Model page URL
        if '/models/' in url:
            parts = parsed.path.split('/')
            if 'models' in parts:
                idx = parts.index('models')
                if idx + 1 < len(parts) and parts[idx + 1].isdigit():
                    result['model_id'] = int(parts[idx + 1])
        
        # Version specific URL
        query_params = parse_qs(parsed.query)
        if 'modelVersionId' in query_params:
            version_id = query_params['modelVersionId'][0]
            if version_id.isdigit():
                result['version_id'] = int(version_id)
        
        return result
    
    def _make_request(self, url: str) -> urllib.request.Request:
        """Create request with proper headers"""
        headers = {'User-Agent': USER_AGENT}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        return urllib.request.Request(url, headers=headers)
    
    def get_model_details(self, model_id: int) -> Dict[str, Any]:
        """Get model details from API"""
        url = f"{API_BASE}/models/{model_id}"
        request = self._make_request(url)
        
        try:
            with urllib.request.urlopen(request) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise DownloadError(f"Model {model_id} not found")
            raise DownloadError(f"API request failed: {e}")
    
    async def download_model(self, url: str, output_path: str, filename: Optional[str] = None) -> str:
        """
        Download a model from CivitAI with progress tracking
        Returns the final filepath
        """
        # Convert web URL to API URL if needed
        if 'civitai.com' in url and '/api/download/models/' not in url:
            ids = self._parse_civitai_url(url)
            
            if ids['version_id']:
                url = f"https://civitai.com/api/download/models/{ids['version_id']}"
            elif ids['model_id']:
                try:
                    model_details = self.get_model_details(ids['model_id'])
                    if model_details.get('modelVersions'):
                        version_id = model_details['modelVersions'][0]['id']
                        url = f"https://civitai.com/api/download/models/{version_id}"
                    else:
                        raise DownloadError(f"No versions found for model {ids['model_id']}")
                except Exception as e:
                    raise DownloadError(f"Failed to get model details: {e}")
            else:
                raise DownloadError("Could not parse model or version ID from URL")
        
        # Disable automatic redirect handling
        class NoRedirection(urllib.request.HTTPErrorProcessor):
            def http_response(self, request, response):
                return response
            https_response = http_response
        
        request = self._make_request(url)
        opener = urllib.request.build_opener(NoRedirection)
        
        try:
            response = opener.open(request)
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise DownloadError("Authentication required. Please provide a valid API token.")
            elif e.code == 403:
                raise DownloadError("Access forbidden. The model might require special permissions.")
            elif e.code == 404:
                raise DownloadError("Model not found. The URL might be incorrect or the model was removed.")
            elif e.code == 429:
                raise DownloadError("Rate limited. Please wait before trying again.")
            else:
                raise DownloadError(f"HTTP error {e.code}: {e.reason}")
        
        # Handle redirects manually
        if response.status in [301, 302, 303, 307, 308]:
            redirect_url = response.getheader('Location')
            
            # Handle relative redirects
            if redirect_url.startswith('/'):
                base_url = urlparse(url)
                redirect_url = f"{base_url.scheme}://{base_url.netloc}{redirect_url}"
            
            # Extract filename from redirect URL if not provided
            if not filename:
                parsed_url = urlparse(redirect_url)
                query_params = parse_qs(parsed_url.query)
                content_disposition = query_params.get('response-content-disposition', [None])[0]
                
                if content_disposition and 'filename=' in content_disposition:
                    filename = unquote(content_disposition.split('filename=')[1].strip('"'))
                else:
                    # Fallback: extract from URL path
                    path = parsed_url.path
                    if path and '/' in path:
                        filename = path.split('/')[-1]
                    else:
                        filename = 'downloaded_model.safetensors'
            
            # Follow the redirect
            response = urllib.request.urlopen(redirect_url)
        elif response.status == 404:
            raise DownloadError('File not found')
        elif response.status != 200:
            raise DownloadError(f'Download failed with status {response.status}')
        
        # Get file size
        total_size = response.getheader('Content-Length')
        if total_size:
            total_size = int(total_size)
        
        # Ensure filename
        if not filename:
            filename = 'model.safetensors'
        
        # Create output path
        output_file = os.path.join(output_path, filename)
        Path(output_path).mkdir(parents=True, exist_ok=True)
        
        # Check for partial download (resume support)
        resume_pos = 0
        if os.path.exists(output_file):
            resume_pos = os.path.getsize(output_file)
            if resume_pos > 0 and total_size and resume_pos < total_size:
                # Try to resume download
                headers = {'User-Agent': USER_AGENT, 'Range': f'bytes={resume_pos}-'}
                if self.token:
                    headers['Authorization'] = f'Bearer {self.token}'
                
                resume_request = urllib.request.Request(redirect_url if 'redirect_url' in locals() else url, headers=headers)
                try:
                    response = urllib.request.urlopen(resume_request)
                    if response.status == 206:  # Partial content
                        if self.progress_callback:
                            await self.progress_callback({
                                'status': 'resuming',
                                'progress': (resume_pos / total_size * 100) if total_size else 0,
                                'message': f'Resuming from {resume_pos / (1024**2):.2f} MB'
                            })
                except:
                    # Resume failed, start over
                    resume_pos = 0
                    response = urllib.request.urlopen(redirect_url if 'redirect_url' in locals() else url)
        
        # Download with progress
        mode = 'ab' if resume_pos > 0 else 'wb'
        import aiofiles
        import inspect
        
        # Use async file I/O for compatibility with async callbacks
        f = await aiofiles.open(output_file, mode)
        try:
            downloaded = resume_pos
            start_time = time.time()
            last_update = time.time()
            
            while True:
                # Check for cancellation
                if self.cancel_event and self.cancel_event.is_set():
                    raise DownloadError("Download cancelled by user")
                
                chunk_start = time.time()
                buffer = response.read(CHUNK_SIZE)
                
                if not buffer:
                    break
                
                downloaded += len(buffer)
                await f.write(buffer)
                
                # Calculate speed
                chunk_time = time.time() - chunk_start
                speed = len(buffer) / chunk_time / (1024 ** 2) if chunk_time > 0 else 0
                
                # Update progress (throttle updates to once per second)
                current_time = time.time()
                if current_time - last_update >= 1.0 or not buffer:
                    if self.progress_callback:
                        progress = (downloaded / total_size * 100) if total_size else 0
                        # Check if callback is async
                        callback_result = self.progress_callback({
                            'status': 'downloading',
                            'progress': progress,
                            'downloaded': downloaded,
                            'total': total_size,
                            'speed': speed,
                            'message': f'{progress:.1f}% - {speed:.2f} MB/s'
                        })
                        if inspect.iscoroutine(callback_result):
                            await callback_result
                    last_update = current_time
        finally:
            await f.close()
        
        # Verify download
        actual_size = os.path.getsize(output_file)
        if total_size and actual_size != total_size:
            raise DownloadError(f"Download incomplete. Expected {total_size} bytes, got {actual_size} bytes")
        
        # Final progress update
        if self.progress_callback:
            await self.progress_callback({
                'status': 'completed',
                'progress': 100,
                'message': f'Download completed: {filename}'
            })
        
        return output_file

async def download_with_progress(url: str, output_path: str, filename: Optional[str] = None,
                                token: Optional[str] = None, 
                                progress_callback: Optional[Callable] = None,
                                cancel_event: Optional[asyncio.Event] = None) -> str:
    """
    Convenience function to download a model with progress tracking
    """
    downloader = CivitAIDownloader(token=token, progress_callback=progress_callback)
    if cancel_event:
        downloader.set_cancel_event(cancel_event)
    
    return await downloader.download_model(url, output_path, filename)

if __name__ == "__main__":
    # Test download
    async def test():
        def progress(data):
            print(f"\r{data['message']}", end='', flush=True)
        
        url = sys.argv[1] if len(sys.argv) > 1 else "https://civitai.com/models/1234"
        output = sys.argv[2] if len(sys.argv) > 2 else "./models"
        
        try:
            result = await download_with_progress(url, output, progress_callback=progress)
            print(f"\n✓ Downloaded to: {result}")
        except Exception as e:
            print(f"\n❌ Error: {e}")
    
    asyncio.run(test())