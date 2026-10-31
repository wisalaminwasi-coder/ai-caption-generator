import { Formidable } from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

function formatTime(seconds) {
  const pad = (num, size = 2) => String(num).padStart(size, '0');
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(millis, 3)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new Formidable();
  
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'File parsing failed' });

    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploadedFile) return res.status(400).json({ error: 'No file uploaded' });

    try {
      const fileBuffer = fs.readFileSync(uploadedFile.filepath);
      const blob = new Blob([fileBuffer], { type: uploadedFile.mimetype });
      
      const formData = new FormData();
      formData.append('file', blob, uploadedFile.originalFilename);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'verbose_json');

      const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: formData
      });

      const groqData = await groqResponse.json();

      if (!groqResponse.ok) {
        return res.status(groqResponse.status).json({ error: groqData.error?.message || 'Groq API error' });
      }

      // Convert response to standard .SRT format
      let srtContent = '';
      if (groqData.segments) {
        groqData.segments.forEach((seg, index) => {
          srtContent += `${index + 1}\n`;
          srtContent += `${formatTime(seg.start)} --> ${formatTime(seg.end)}\n`;
          srtContent += `${seg.text.trim()}\n\n`;
        });
      } else {
        srtContent = `1\n00:00:00,000 --> 00:00:10,000\n${groqData.text}`;
      }

      return res.status(200).json({ srt: srtContent });
    } catch (error) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
}
