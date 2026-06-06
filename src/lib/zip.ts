import JSZip from 'jszip';

export interface ExtractedFile {
  path: string;
  name: string;
  size: number;
  content: string; // base64
  isSelected: boolean;
}

export const extractZip = async (file: File): Promise<ExtractedFile[]> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);
  const extractedFiles: ExtractedFile[] = [];

  const promises: Promise<void>[] = [];

  loadedZip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir) {
      promises.push(
        zipEntry.async('base64').then((content) => {
          extractedFiles.push({
            path: relativePath,
            name: zipEntry.name.split('/').pop() || zipEntry.name,
            size: Math.round((content.length * 3) / 4), // Approximate size from base64
            content,
            isSelected: true,
          });
        })
      );
    }
  });

  await Promise.all(promises);
  
  // Sort alphabetically by path
  return extractedFiles.sort((a, b) => a.path.localeCompare(b.path));
};
