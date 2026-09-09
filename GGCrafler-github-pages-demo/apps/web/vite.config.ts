import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react';
// GitHub exposes owner/repository while Actions builds. It keeps Pages working for any repository name.
const repoName=process.env.GITHUB_REPOSITORY?.split('/')[1];
export default defineConfig({base:process.env.GITHUB_ACTIONS&&repoName?`/${repoName}/`:'/',plugins:[react()],server:{port:5173,proxy:{'/api':'http://localhost:3001'}},build:{outDir:'dist'}});
