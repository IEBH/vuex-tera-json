// api.ts

import { TeraApi } from "../index.js";

/**
 * The base URL for the TERA IO API endpoints.
 */
// Prod
const API_BASE_URL = 'https://tera-tools.com/api/io';
// Dev
// const API_BASE_URL = 'https://dev-tera-io.tera-997.workers.dev';
// Dev ECH fix version
// const API_BASE_URL = 'https://dev-worker.tera-tools.com/api/io';
// Specific version
// const API_BASE_URL = 'https://546d6f12-tera-io.tera-997.workers.dev';
// Localhost
// const API_BASE_URL = 'http://localhost:8787';

/**
 * Represents the structure of a file object returned by the list endpoint.
 */
export interface ApiFile {
  name: string;
  size: number;
  modified: string; // ISO 8601 date string
}

/**
 * Safely encodes a file path for use in a URL.
 * It encodes each segment of the path individually, preserving the '/' separators.
 * @param path The file path to encode.
 * @returns A URL-safe path string.
 */
function encodeFilePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * A centralized fetch wrapper that adds the authentication token to every request.
 * @param endpoint The API endpoint to call (e.g., /projects/some-id/files).
 * @param teraInstance The main TeraApi instance to get the token from.
 * @param options Standard RequestInit options for fetch (method, body, etc.).
 * @returns A promise that resolves to the raw Fetch Response.
 */
async function apiFetch(
  endpoint: string,
  teraInstance: TeraApi,
  options: RequestInit = {}
): Promise<Response> {
  const token = await teraInstance.getKindeToken();
  if (!token) {
    throw new Error("Authorization token is missing. Please log in again.");
  }

  // Prepare the default headers with authentication
  const defaultHeaders = new Headers({
    'Authorization': `Bearer ${token}`
  });

  // Merge any custom headers from the options
  if (options.headers) {
    const customHeaders = new Headers(options.headers);
    customHeaders.forEach((value, key) => {
      // Use set() to allow overriding, or append() if multiple values for a header are allowed
      defaultHeaders.set(key, value);
    });
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers: defaultHeaders,
  };

  return fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
}


/**
 * Retrieves the content of a specific file from a project's storage.
 * @param projectId The UUID of the project.
 * @param filePath The path/name of the file to retrieve.
 * @param teraInstance The TeraApi instance for authentication.
 * @returns A promise that resolves to the parsed JSON content of the file, or `null` if not found.
 */
export async function getFileContent(projectId: string, filePath: string, teraInstance: TeraApi): Promise<any | null> {
  const safeFilePath = encodeFilePath(filePath);
  const endpoint = `/projects/${projectId}/files/${safeFilePath}`;

  const response = await apiFetch(endpoint, teraInstance);

  if (response.status === 404) {
    return null; // File not found is a normal, handled case.
  }

  if (!response.ok) {
    throw new Error(`Failed to get file content for "${filePath}". Status: ${response.status}`);
  }

  try {
    return await response.json();
  } catch (e) {
    throw new Error(`Failed to parse JSON content from file "${filePath}".`);
  }
}

/**
 * Saves content to a file in a project's storage.
 * This will create the file if it does not exist, or overwrite it if it does.
 * @param projectId The UUID of the project.
 * @param filePath The path/name of the file to save.
 * @param content The JavaScript object to be saved as JSON.
 * @param teraInstance The TeraApi instance for authentication.
 * @returns A promise that resolves when the operation is complete.
 * @throws An error if the network request fails or the server returns an error.
 */
export async function saveFileContent(projectId: string, filePath: string, content: any, teraInstance: TeraApi): Promise<void> {
  const safeFilePath = encodeFilePath(filePath);
  // ?overwrite=1 indicates to overwrite the file
  const endpoint = `/projects/${projectId}/files/${safeFilePath}?overwrite=1`;

  const formData = new FormData();
  const file = new File([JSON.stringify(content, null, 2)], filePath, { type: 'application/json' });
  formData.append('file', file);

  const response = await apiFetch(endpoint, teraInstance, {
    method: 'PUT',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to save file content. Status: ${response.status}, Body: ${errorText}`);
  }
}

// /**
//  * Fetches a list of all files at the root of a project's storage.
//  * @param projectId The UUID of the project.
//  * @param teraInstance The TeraApi instance for authentication.
//  * @returns A promise that resolves to an array of file objects.
//  * @throws An error if the network request fails or the server returns an error.
//  */
// export async function getProjectFiles(projectId: string, teraInstance: TeraApi): Promise<ApiFile[]> {
//     const endpoint = `/projects/${projectId}/files/`;

//     const response = await apiFetch(endpoint, teraInstance);

//     if (!response.ok) {
//         throw new Error(`Failed to list project files. Status: ${response.status}`);
//     }
//     return await response.json();
// }

// /**
//  * Fetches the metadata object for a given project.
//  * @param projectId The UUID of the project.
//  * @returns A promise that resolves to the project's 'data' object.
//  * @throws An error if the network request fails or the server returns an error.
//  */
// export async function getProjectMetadata(projectId: string): Promise<Record<string, any>> {
//   const response = await fetch(`${API_BASE_URL}/projects/${projectId}`);
//   if (!response.ok) {
//     throw new Error(`Failed to fetch project metadata for ID ${projectId}. Status: ${response.status}`);
//   }
//   const project = await response.json();
//   // The server wraps the state in a 'data' property.
//   return project.data || {};
// }

// /**
//  * Updates the metadata for a given project.
//  * This performs a merge operation on the server.
//  * @param projectId The UUID of the project.
//  * @param payload The data object to merge into the project's metadata.
//  * @returns A promise that resolves when the operation is complete.
//  * @throws An error if the network request fails or the server returns an error.
//  */
// export async function setProjectMetadata(projectId: string, payload: Record<string, any>): Promise<void> {
//   const response = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(payload),
//   });

//   if (!response.ok) {
//     const errorText = await response.text();
//     throw new Error(`Failed to set project metadata. Status: ${response.status}, Body: ${errorText}`);
//   }
// }