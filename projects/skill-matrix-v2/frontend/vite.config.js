import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Port mapping for backend functions
// Add new functions here following the pattern: function_name -> port
const BACKEND_PORTS = {
  // Skills functions
  'save_employee_skill_v2': 8080,
  'get_employee_skill_v2': 8081,
  'get_skill_hierarchy_link_v2': 8082,
  'get_pending_skill_request_v2': 8083,
  'review_skill_request_v2': 8084,
  'get_master_file_v2': 8085,
  'add_skill_v2': 8087,
  // Employee functions
  'save_employee_v2': 8090,
  'update_manager_email': 8091,  // Note: frontend uses update_manager_email (no _v2)
  'update_manager_email_v2': 8091,
  'upload_cv_v2': 8092,
  'upload_cv': 8092,  // Fallback for old endpoint name
  'get_employee_skills_info': 8093,
  'get_emp_training_course_v2': 8094,

  // Certificate functions
  'get_certificate_mapping_v2': 8100,
  'get_employee_certificate_v2': 8102,
  'get_employee_certificates_v2': 8103,
  'save_employee_certificate_v2': 8104,
  'get_certificate_requests': 8105,
  'review_certificate': 8106,
  'add_certificate_v2': 8107,
  // Training / hierarchy
  'add_training_v2': 8108,
  'add_training_course_v2': 8112,
  'get_combined_hierarchy_v2': 8110,
  // Comments
  'manage_comments_v2': 8111,
  // Quiz
  'attempt_quiz_v2': 8113,
  // GenAI functions
  'ask_question_v2': 8120,
  // Reports functions
  'get_employee_skill_matrix_report_v2': 8086,
  'get_employee_skills_report_v2': 8088,
  'get_employee_certificate_report_v2': 8095,
  'get_employee_training_report_v2': 8096,
  'get_training_analytics_v2': 8097,
}

// Proxy for ask-question-v2 - routes to root path (same as Cloud Function)
const askQuestionProxy = {
  target: `http://localhost:${BACKEND_PORTS['ask_question_v2']}`,
  changeOrigin: true,
  // Preserve query parameters when rewriting path
  rewrite: (path) => {
    const queryIndex = path.indexOf('?')
    const queryString = queryIndex !== -1 ? path.substring(queryIndex) : ''
    return '/' + queryString
  },
}

// add_skill_v2 needs path preserved so /add_skill_v2/bulk-upload reaches backend as /bulk-upload
const addSkillV2Proxy = {
  target: `http://localhost:${BACKEND_PORTS['add_skill_v2']}`,
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/add_skill_v2(?:\/)?/, '/') || '/',
}

// add_training_v2 needs path preserved so /add_training_v2/bulk-upload reaches backend as /bulk-upload (multipart/form-data)
const addTrainingV2Proxy = {
  target: `http://localhost:${BACKEND_PORTS['add_training_v2']}`,
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/add_training_v2(?:\/)?/, '/') || '/',
}

// add_certificate_v2 needs path preserved so /add_certificate_v2/bulk-upload reaches backend as /bulk-upload (multipart/form-data)
const addCertificateV2Proxy = {
  target: `http://localhost:${BACKEND_PORTS['add_certificate_v2']}`,
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/add_certificate_v2(?:\/)?/, '/') || '/',
}

// add_training_course_v2 needs path preserved so /add_training_course_v2/lessons reaches backend as /lessons
const addTrainingCourseV2Proxy = {
  target: `http://localhost:${BACKEND_PORTS['add_training_course_v2']}`,
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/add_training_course_v2(?:\/)?/, '/') || '/',
}

// Generate proxy configuration from port mapping
const generateProxyConfig = () => {
  const proxy = {}
  for (const [endpoint, port] of Object.entries(BACKEND_PORTS)) {
    if (endpoint === 'add_skill_v2') continue // use addSkillV2Proxy instead
    if (endpoint === 'add_training_v2') continue // use addTrainingV2Proxy instead
    if (endpoint === 'add_certificate_v2') continue // use addCertificateV2Proxy instead
    proxy[`/${endpoint}`] = {
      target: `http://localhost:${port}`,
      changeOrigin: true,
      // Preserve query parameters when rewriting path
      rewrite: (path) => {
        // Extract query string if present
        const queryIndex = path.indexOf('?')
        const queryString = queryIndex !== -1 ? path.substring(queryIndex) : ''
        return '/' + queryString
      },
    }
  }
  proxy['/add_skill_v2'] = addSkillV2Proxy
  proxy['/add_training_v2'] = addTrainingV2Proxy
  proxy['/add_certificate_v2'] = addCertificateV2Proxy
  proxy['/add_training_course_v2'] = addTrainingCourseV2Proxy
  // Ask question function: /ask_question_v2 -> http://localhost:8120/ (root path)
  proxy['/ask_question_v2'] = askQuestionProxy
  return proxy
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: generateProxyConfig(),
  },
})
