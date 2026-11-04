# Frontend-Backend Certificate Functions Sync Status

## Overview

This document tracks the synchronization status between frontend and backend certificate functions.

---

## ✅ Synced Functions

### 1. `get_certificate_mapping_v2`

**Backend**: `backend/certificates/getCertificateMapping_v2/`  
**Frontend**: `frontend/src/context/CertificateContext.jsx` (line 34)

**Status**: ✅ **FULLY SYNCED**

**Frontend Call**:
```javascript
const response = await axios.get(`${BASE_URL}get_certificate_mapping_v2`);
```

**Backend Response**:
```json
[
  {
    "mappingId": 1,
    "certProvider": "AWS",
    "certName": "Solutions Architect",
    "certLevel": "Associate",
    "validYears": 3,
    "isActive": true,
    ...
  }
]
```

**Frontend Usage**:
- Uses `cert.mappingId` ✅
- Uses `cert.certProvider` ✅
- Uses `cert.certName` ✅
- Uses `cert.certLevel` ✅
- Finds "Other" certificate: `cert.certName?.toLowerCase() === "other"` ✅

**Field Mapping**: All fields match perfectly.

---

### 2. `get_employee_certificate_v2`

**Backend**: `backend/certificates/getEmployeeCertificate_v2/`  
**Frontend**: `frontend/src/context/CertificateContext.jsx` (line 90)

**Status**: ✅ **FULLY SYNCED**

**Frontend Call**:
```javascript
const response = await axios.post(`${BASE_URL}get_employee_certificate_v2`, { email });
```

**Backend Response**:
```json
{
  "email": "employee@example.com",
  "certificates": [
    {
      "mappingId": 1,
      "certificateName": "Solutions Architect",
      "certLevel": "Associate",
      "validYears": 3,
      "certProvider": "AWS",
      "issuedDate": "2024-01-15T00:00:00",
      "expiryDate": "2027-01-15T00:00:00",
      "empCertId": 1,
      "yearAchieved": 2024
    }
  ]
}
```

**Frontend Usage**:
- Uses `response.data.certificates` ✅
- Uses `c.mappingId` ✅
- Uses `c.certificateName` ✅
- Uses `c.certProvider` ✅
- Uses `c.certLevel` ✅

**Field Mapping**: All fields match perfectly.

---

### 3. `save_employee_certificate_v2`

**Backend**: `backend/certificates/saveEmployeeCertificate_v2/`  
**Frontend**: `frontend/src/context/CertificateContext.jsx` (line 168)

**Status**: ✅ **FULLY SYNCED**

**Frontend Call**:
```javascript
await axios.post(`${BASE_URL}save_employee_certificate_v2`, {
  email: employeeInfo.email.toLowerCase(),
  managerEmail: employeeInfo.managerEmail?.toLowerCase() || "",
  certificates: selectedCertificates.map((cert) => ({
    certProvider: cert.certProvider,
    certName: cert.certName,
    certLevel: cert.certLevel || null,
    yearAchieved: cert.yearAchieved || null,
    expiryDate: cert.expiryDate || null,
    verified: cert.verified ?? false,
    certIdExternal: cert.certIdExternal || null,
  }))
});
```

**Backend Expects**:
```json
{
  "email": "employee@example.com",
  "managerEmail": "manager@example.com",
  "certificates": [
    {
      "certProvider": "AWS",
      "certName": "Solutions Architect",
      "certLevel": "Associate",
      "yearAchieved": 2023,
      "expiryDate": "2026-12-31"
    }
  ]
}
```

**Field Mapping**:
- `email` ✅
- `managerEmail` ✅
- `certificates[].certProvider` ✅
- `certificates[].certName` ✅
- `certificates[].certLevel` ✅
- `certificates[].yearAchieved` ✅
- `certificates[].expiryDate` ✅
- `certificates[].verified` ⚠️ (sent by frontend, ignored by backend - OK)
- `certificates[].certIdExternal` ⚠️ (sent by frontend, ignored by backend - OK)

**Backend Response**:
```json
{
  "message": "Certificates processed for employee@example.com",
  "deleted_count": 2,
  "upserted_count": 3,
  "warnings": []
}
```

**Frontend Usage**: Frontend doesn't use the response fields, just shows success/error toast. ✅

---

## ⚠️ Missing Backend Functions

### 1. `get_certificate_requests`

**Frontend**: `frontend/src/context/CertificateContext.jsx` (line 226)  
**Status**: ❌ **BACKEND FUNCTION MISSING**

**Frontend Call**:
```javascript
const res = await axios.get(`${BASE_URL}get_certificate_requests`, {
  params: { email: userEmail }
});
```

**Frontend Expects**:
- Array of employee objects with pending certificate requests
- Used for manager approval workflow

**Action Required**: Create `backend/certificates/getCertificateRequests_v2/` function (similar to `getPendingSkillRequest_v2`).

---

### 2. `review_certificate`

**Frontend**: `frontend/src/context/CertificateContext.jsx` (line 280)  
**Status**: ❌ **BACKEND FUNCTION MISSING**

**Frontend Call**:
```javascript
const res = await axios.post(`${BASE_URL}review_certificate`, {
  approvedByEmail,
  action, // "approve" or "reject"
  reason: action === "reject" ? reason || "No reason provided" : null,
  certificates: certIds.map((id) => ({ empCertId: id }))
});
```

**Frontend Expects**:
- Response with `message` field
- Updates certificate approval status

**Action Required**: Create `backend/certificates/reviewCertificate_v2/` function (similar to `reviewSkillRequest_v2`).

---

## 🗑️ Unused References

### 1. `get_employee_certificates_v2`

**Status**: ⚠️ **REFERENCED BUT NOT USED**

**Location**:
- `frontend/vite.config.js` (line 25): Port 8103
- `frontend/BACKEND_PORTS.md` (line 22): Port 8103

**Issue**: Frontend never calls this endpoint. Only `get_employee_certificate_v2` (singular) is used.

**Action Required**: Remove from `vite.config.js` and `BACKEND_PORTS.md`.

---

## Summary

### ✅ Fully Synced (3 functions)
1. `get_certificate_mapping_v2` ✅
2. `get_employee_certificate_v2` ✅
3. `save_employee_certificate_v2` ✅

### ❌ Missing Backend Functions (2 functions)
1. `get_certificate_requests` - Frontend calls it, backend doesn't exist
2. `review_certificate` - Frontend calls it, backend doesn't exist

### ⚠️ Cleanup Needed
1. Remove `get_employee_certificates_v2` from `vite.config.js` and `BACKEND_PORTS.md`

---

## Recommendations

1. **Create missing functions**:
   - `backend/certificates/getCertificateRequests_v2/` - For fetching pending certificate requests
   - `backend/certificates/reviewCertificate_v2/` - For approving/rejecting certificates

2. **Clean up unused references**:
   - Remove `get_employee_certificates_v2` from `frontend/vite.config.js`
   - Remove `get_employee_certificates_v2` from `frontend/BACKEND_PORTS.md`

3. **Field naming consistency**: All v2 functions use snake_case in database but return PascalCase/camelCase in API responses, which matches frontend expectations. ✅

---

## Notes

- All existing v2 certificate functions use SQLAlchemy and environment variables ✅
- All existing v2 certificate functions use v2 schema (snake_case tables) ✅
- All existing v2 certificate functions have proper CORS headers ✅
- Frontend uses `BASE_URL` from environment variables ✅
- Frontend properly handles errors and loading states ✅
