import { Injectable } from '@nestjs/common';
import { MindstudioUploadDto } from './MindStudio-api-Dtos/mindstudio-api-dto';

@Injectable()
export class MindstudioUploadService {
  private readonly apiUrl = 'https://api.mindstudio.ai/developer/v2/agents/run';
  private readonly apiKey = process.env.MINDSTUDIO_API_KEY;

  async sendToMindstudio(dto: MindstudioUploadDto) {
    try {
      const { email, attachment } = dto;

      const requestBody = {
        appId: process.env.WORKER_ID,
        variables: {
          from: email,
          attachments: attachment,
        },
        workflow: process.env.WORKFLOW_NAME,
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(
          `MindStudio API request failed: ${response.statusText}`,
        );
      }

      const data = await response.json();

      const finalOutput = this.extractLastValueFromDebugLogs(data);

      if (!finalOutput) {
        throw new Error('No final output found.');
      }

      // ❌ Don't use cleanAndStructureFinalOutput()
      // ✅ Instead, just parse it directly:
      const parsedOutput = JSON.parse(
        finalOutput.replace(/^Execution error: Error: API Error: /, '').trim(),
      );

      console.log('Parsed final output:', parsedOutput);

      return {
        success: parsedOutput.success,
        cases: parsedOutput.cases,
        errorLogUrl: parsedOutput.errorLogUrl || null,
      };
    } catch (error) {
      console.error('Mindstudio upload failed: ', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private extractLastValueFromDebugLogs(json: any): string | null {
    if (!json || !json.thread || !json.thread.posts) {
      return null;
    }

    const posts = json.thread.posts;
    let lastValue: string | null = null;

    for (const post of posts) {
      if (post?.type === 'debugLog') {
        const logs = post.debugLog?.logs || [];
        for (const log of logs) {
          if (typeof log?.value === 'string') {
            lastValue = log.value; // Keep the last log value
          }
        }
      }
    }

    return lastValue;
  }

  // Function to clean and structure the final output
  private cleanAndStructureFinalOutput(finalOutput: string) {
    try {
      // Remove boilerplate prefix
      const cleanedOutput = finalOutput
        .replace(/^Execution error: Error: API Error: /, '')
        .trim();

      // Try to parse it as JSON
      const parsed = JSON.parse(cleanedOutput);
      const details = parsed.details;

      const extractedIssues = [];

      // Loop through all detail entries
      if (Array.isArray(details)) {
        for (const entry of details) {
          // Try known patterns first
          const backgroundMatches = this.extractBackgroundViolations(entry);
          const imageMatches = this.extractImageMismatches(entry);

          if (backgroundMatches.length > 0) {
            extractedIssues.push({
              type: 'Background Styling Issues',
              entries: backgroundMatches,
            });
          } else if (imageMatches.length > 0) {
            extractedIssues.push({
              type: 'Image Mismatches',
              entries: imageMatches,
            });
          } else {
            // If no known patterns matched, return raw text
            extractedIssues.push({ type: 'Unknown Issue', raw: entry });
          }
        }
      }

      return {
        issues: extractedIssues,
        errorLogUrl: parsed.errorLogUrl ?? null,
      };
    } catch (err) {
      console.error('Failed to parse/structure finalOutput:', err.message);
      return { error: 'Could not structure output', raw: finalOutput };
    }
  }

  // Helper function to extract background violations
  private extractBackgroundViolations(details: string): string[] {
    const backgroundViolationPattern =
      /Background-color (outside|in) <table> in (.+?) \(line (\d+)\)/g;
    let match;
    const violations = [];

    while ((match = backgroundViolationPattern.exec(details)) !== null) {
      violations.push({
        violationType: match[1], // "outside" or "in"
        fileName: match[2],
        lineNumber: match[3],
      });
    }

    return violations;
  }

  // Helper function to extract image mismatches
  private extractImageMismatches(details: string): string[] {
    const imageMismatchPattern =
      /Image file "([^"]+)" (not found in ZIP|Dimension mismatch for "[^"]+": HTML \(\d+x\d+\) vs Actual \(\d+x\d+\))/g;
    let match;
    const mismatches = [];

    while ((match = imageMismatchPattern.exec(details)) !== null) {
      mismatches.push({
        imagePath: match[1],
        issue: match[2],
      });
    }

    return mismatches;
  }
}
