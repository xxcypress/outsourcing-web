/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable import/no-anonymous-default-export */
import { useAuthStore } from '@/store/use-auth-store';
import axios, { AxiosRequestConfig } from 'axios';
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
console.log('API_BASE_URL', API_BASE_URL);
export default (config: AxiosRequestConfig) => {
  const instance = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
    withCredentials: false,
  });
  instance.interceptors.request.use(
    config => {
      useAuthStore.setState({ isLoading: !useAuthStore.getState().isLoading });
      config.headers.Authorization = useAuthStore.getState().accessToken();
      return config;
    },
    error => {
      return Promise.reject(error);
    }
  );
  instance.interceptors.response.use(
    response => {
      useAuthStore.setState({ isLoading: !useAuthStore.getState().isLoading });
      if (response.status === 401) {
        console.error('unauthorized ', response.data);
      }
      return response;
    },
    error => {
      useAuthStore.setState({ isLoading: !useAuthStore.getState().isLoading });
      return Promise.reject(error);
    }
  );
  return instance(config);
};

interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * 处理流式响应
 */
const stream = async (
  endpoint: string,
  data: any,
  onChunk: (chunk: string) => void
): Promise<ApiResponse<null>> => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  headers.Authorization = useAuthStore.getState().accessToken();

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        error: errorData.detail || '请求失败',
        status: response.status,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        error: '无法读取响应流',
        status: 500,
      };
    }

    const decoder = new TextDecoder();
    let done = false;
    let buffer = '';

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;

      if (value) {
        const chunk = decoder.decode(value, { stream: !done });
        buffer += chunk;
        // 处理可能包含多个JSON对象的情况（按行分割）
        const lines = buffer.split('\n');
        for (let i = 0; i < lines.length - 1; i++) {
          const eventData = lines[i].match(/{.*}/);
          // console.log('eventData', eventData);
          if (eventData) {
            try {
              const json = JSON.parse(eventData[0]);
              if (json.answer) {
                onChunk(json.answer);
                // console.log('json.answer', json.answer);
              }
            } catch (error) {
              console.error('解析 JSON 失败:', eventData);
            }
          } else {
            onChunk('');
          }
        }
        buffer = lines[lines.length - 1];
      }
    }

    // 处理缓冲区中剩余的数据
    if (buffer.trim()) {
      onChunk(buffer);
    }

    return { status: response.status };
  } catch (error) {
    return {
      error: '网络错误',
      status: 500,
    };
  }
};

export { stream };
