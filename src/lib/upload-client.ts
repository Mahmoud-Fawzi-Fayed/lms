export async function uploadFileWithProgress({
  url,
  file,
  fields,
  onProgress,
  chunkSizeBytes = 8 * 1024 * 1024,
}: {
  url: string;
  file: File;
  fields?: Record<string, string>;
  onProgress?: (percent: number) => void;
  chunkSizeBytes?: number;
}) {
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSizeBytes));
  const uploadId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastResponse: any = null;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSizeBytes;
    const end = Math.min(start + chunkSizeBytes, file.size);
    const chunk = file.slice(start, end, file.type || undefined);

    const formData = new FormData();
    formData.append('file', chunk, file.name);
    Object.entries(fields || {}).forEach(([key, value]) => formData.append(key, value));
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', String(chunkIndex));
    formData.append('totalChunks', String(totalChunks));
    formData.append('originalFileName', file.name);
    formData.append('totalFileSize', String(file.size));

    lastResponse = await new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) return;
        const currentChunkPercent = event.loaded / event.total;
        const overallPercent = Math.round(((chunkIndex + currentChunkPercent) / totalChunks) * 100);
        onProgress(Math.max(0, Math.min(100, overallPercent)));
      };

      xhr.onload = () => {
        let data: any = {};
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch {
          data = { error: xhr.responseText || 'Upload failed' };
        }

        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          resolve(data);
        } else {
          reject(new Error(data.error || 'فشل رفع الملف'));
        }
      };

      xhr.onerror = () => reject(new Error('فشل الاتصال أثناء الرفع'));
      xhr.send(formData);
    });
  }

  onProgress?.(100);
  return lastResponse;
}
