import { Injectable } from '@nestjs/common';
import { MindstudioUploadDto } from './MindStudio-api-Dtos/mindstudio-api-dto';
import axios from 'axios';

@Injectable()
export class MindstudioUploadService {
  private readonly apiUrl = 'https://api.mindstudio.ai/developer/v2/agents/run';
  private readonly apiKey =
    'skuVkbPAbpZe68oskY0QseGcQSQC6OSUS2SyGqkEQQow2wSks8yywaqwGagYQa6GgiECMws8iQkAgkoqiUgOCA20';
  axios = require('axios');

  async sendToMindstudio(dto: MindstudioUploadDto) {
    try {
      const { email, attachment } = dto;

      console.log('[MindstudioUploadService] Starting sendToMindstudio');
      console.log('[MindstudioUploadService] API Key Loaded:', !!this.apiKey);
      console.log('[MindstudioUploadService] API URL:', this.apiUrl);
      console.log('[MindstudioUploadService] Input DTO:', {
        email,
        attachment,
      });
      console.log(
        '[MindstudioUploadService] WORKER_ID:',
        process.env.WORKER_ID,
      );

      const requestBody = {
        appId: '46dcfa1a-c38c-40bf-a9df-70b6e03376ae',
        variables: {
          from: email,
          attachments: attachment,
        },
        workflow: 'MVP_Test.flow',
      };

      console.log('[MindstudioUploadService] Request Body:', requestBody);

      const response = await axios.post(this.apiUrl, requestBody, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      });

      console.log('[MindstudioUploadService] Raw response received');

      const data = response.data;
      console.log(
        '[MindstudioUploadService] Response Data:',
        JSON.stringify(data, null, 2),
      );

      const finalOutput = this.extractLastValueFromDebugLogs(data);

      if (!finalOutput) {
        console.error(
          '[MindstudioUploadService] ❌ No final output found in debug logs',
        );
        throw new Error('No final output found inside debug logs.');
      }

      console.log('[MindstudioUploadService] Final Output:', finalOutput);

      let parsedOutput;
      try {
        const cleanedOutput = finalOutput
          .replace(/^Execution error: Error: API Error:/, '')
          .trim();

        // Inside sendToMindstudio after parsing the cleanedOutput
        if (this.isJsonString(cleanedOutput)) {
          parsedOutput = JSON.parse(cleanedOutput);

          console.log(
            '[MindstudioUploadService] ✅ Parsed Final Output:',
            parsedOutput,
          );

          return {
            success: parsedOutput.success ?? true,
            results:
              parsedOutput.results ??
              parsedOutput.value ??
              parsedOutput ??
              null, // fallback to parsedOutput itself
          };
        } else {
          // 🔥 New behavior here
          console.error(
            '[MindstudioUploadService] ❌ Final output is not JSON. Returning error string instead.',
            cleanedOutput,
          );
          return {
            success: false,
            error: cleanedOutput,
          };
        }
      } catch (err) {
        console.error(
          '[MindstudioUploadService] ❌ Error while handling final output:',
          err.message,
        );
        return {
          success: false,
          error: err.message,
        };
      }
    } catch (error) {
      console.error(
        '[MindstudioUploadService] ❌ Error in sendToMindstudio:',
        error,
      );

      if (axios.isAxiosError(error)) {
        console.error(
          '[MindstudioUploadService] Axios Error Response:',
          error.response?.data,
        );
        return {
          success: false,
          error: error.response ? error.response.data : error.message,
        };
      } else {
        console.error(
          '[MindstudioUploadService] General Error:',
          error.message,
        );
        return {
          success: false,
          error: error.message,
        };
      }
    }
  }

  private isJsonString(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }
  private extractLastValueFromDebugLogs(json: any): string | null {
    if (!json || !json.thread || !json.thread.posts) {
      console.error(
        '[MindstudioUploadService] ❌ Invalid debug logs structure',
      );
      return null;
    }

    const posts = json.thread.posts;
    let lastValue: string | null = null;

    for (const post of posts) {
      if (post?.type === 'debugLog') {
        const logs = post.debugLog?.logs || [];
        for (const log of logs) {
          if (typeof log?.value === 'string') {
            lastValue = log.value;
          }
        }
      }
    }

    if (!lastValue) {
      console.warn('[MindstudioUploadService] ⚠️ No debugLog value found');
    }

    return lastValue;
  }
}
