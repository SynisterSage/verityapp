#!/bin/bash

# Test validation middleware with curl

echo "=== Testing Zod Validation Middleware ==="
echo ""

BASE_URL="http://localhost:5000/api/v1"
TOKEN="Bearer test-token"

# Test 1: Profile creation with empty first name (should fail)
echo "Test 1: POST /profiles with empty first_name (should FAIL validation)"
curl -s -X POST "$BASE_URL/profiles" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"first_name":"", "last_name":"Smith"}' | jq .
echo ""

# Test 2: Profile creation with valid data (should pass validation)
echo "Test 2: POST /profiles with valid data (should PASS validation)"
curl -s -X POST "$BASE_URL/profiles" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"first_name":"John", "last_name":"Smith"}' | jq .
echo ""

# Test 3: Passcode verification with non-numeric PIN (should fail)
echo "Test 3: POST /profiles/:id/passcode-verify with non-numeric PIN (should FAIL)"
curl -s -X POST "$BASE_URL/profiles/test-id/passcode-verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"pin":"abcd"}' | jq .
echo ""

# Test 4: Set passcode with invalid PIN length (should fail)
echo "Test 4: POST /profiles/:id/passcode with 3-digit PIN (should FAIL - min 4 digits)"
curl -s -X POST "$BASE_URL/profiles/test-id/passcode" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"pin":"123"}' | jq .
echo ""

# Test 5: Assign number with valid data (should pass validation)
echo "Test 5: POST /profiles/:id/assign-number with valid data (should PASS validation)"
curl -s -X POST "$BASE_URL/profiles/test-id/assign-number" \
  -H "Content-Type: application/json" \
  -H "Authorization: $TOKEN" \
  -d '{"source":"onboarding"}' | jq .
echo ""

# Test 6: Invalid email in reset password (should fail)
echo "Test 6: POST /auth/reset-password with invalid email (should FAIL)"
curl -s -X POST "$BASE_URL/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email"}' | jq .
echo ""

echo "=== Validation Tests Complete ==="
