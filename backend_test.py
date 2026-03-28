import requests
import sys
import json
from datetime import datetime

class ElectionPatrolAPITester:
    def __init__(self, base_url="https://live-response-3.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def run_test(self, name, method, endpoint, expected_status, data=None, expected_keys=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            response_data = {}
            
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}

            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                
                # Check for expected keys in response
                if expected_keys and isinstance(response_data, dict):
                    for key in expected_keys:
                        if key not in response_data:
                            print(f"⚠️  Warning: Expected key '{key}' not found in response")
                        else:
                            print(f"   ✓ Found expected key: {key}")
                
                if isinstance(response_data, list):
                    print(f"   Response: Array with {len(response_data)} items")
                elif isinstance(response_data, dict):
                    print(f"   Response keys: {list(response_data.keys())}")
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response_data}")

            self.test_results.append({
                "name": name,
                "method": method,
                "endpoint": endpoint,
                "expected_status": expected_status,
                "actual_status": response.status_code,
                "success": success,
                "response_data": response_data
            })

            return success, response_data

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.test_results.append({
                "name": name,
                "method": method,
                "endpoint": endpoint,
                "expected_status": expected_status,
                "actual_status": "ERROR",
                "success": False,
                "error": str(e)
            })
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200,
            expected_keys=["message"]
        )

    def test_get_personnel(self):
        """Test GET /api/personnel - should return 5 officers all with status 'free'"""
        success, response = self.run_test(
            "Get Personnel",
            "GET",
            "personnel",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} officers")
            if len(response) == 5:
                print("   ✓ Correct number of officers (5)")
            else:
                print(f"   ⚠️  Expected 5 officers, got {len(response)}")
            
            free_officers = [o for o in response if o.get('status') == 'free']
            print(f"   Free officers: {len(free_officers)}")
            
            for officer in response:
                required_fields = ['id', 'name', 'badge', 'lat', 'lng', 'status', 'avatar']
                missing_fields = [field for field in required_fields if field not in officer]
                if missing_fields:
                    print(f"   ⚠️  Officer {officer.get('id', 'unknown')} missing fields: {missing_fields}")
                else:
                    print(f"   ✓ Officer {officer['id']} has all required fields")
        
        return success, response

    def test_create_incident(self):
        """Test POST /api/incident - should create incident and assign nearest officer"""
        test_location = {
            "lat": 14.6819,
            "lng": 77.6006,
            "description": "Test incident for API testing"
        }
        
        success, response = self.run_test(
            "Create Incident",
            "POST",
            "incident",
            200,
            data=test_location,
            expected_keys=["success", "id", "assigned_officer", "distance_km"]
        )
        
        if success and isinstance(response, dict):
            if response.get('success'):
                print("   ✓ Incident created successfully")
                if 'assigned_officer' in response:
                    officer = response['assigned_officer']
                    print(f"   ✓ Assigned officer: {officer.get('name', 'Unknown')} ({officer.get('id', 'Unknown ID')})")
                    if officer.get('status') == 'busy':
                        print("   ⚠️  Warning: Assigned officer status should be 'busy' but API response shows officer data before status update")
                if 'distance_km' in response:
                    print(f"   ✓ Distance calculated: {response['distance_km']} km")
            else:
                print(f"   ❌ Incident creation failed: {response.get('error', 'Unknown error')}")
        
        return success, response

    def test_officer_status_after_assignment(self):
        """Test that officer status changes to 'busy' after assignment"""
        # First get all personnel to see current status
        success, officers = self.test_get_personnel()
        if not success:
            return False, {}
        
        # Create an incident to assign an officer
        incident_success, incident_response = self.test_create_incident()
        if not incident_success or not incident_response.get('success'):
            return False, {}
        
        assigned_officer_id = incident_response.get('assigned_officer', {}).get('id')
        if not assigned_officer_id:
            print("   ❌ No assigned officer ID found")
            return False, {}
        
        # Check personnel again to verify status change
        success, updated_officers = self.run_test(
            "Verify Officer Status Change",
            "GET",
            "personnel",
            200
        )
        
        if success:
            assigned_officer = next((o for o in updated_officers if o['id'] == assigned_officer_id), None)
            if assigned_officer:
                if assigned_officer['status'] == 'busy':
                    print(f"   ✓ Officer {assigned_officer_id} status correctly changed to 'busy'")
                    return True, {"incident_id": incident_response['id'], "officer_id": assigned_officer_id}
                else:
                    print(f"   ❌ Officer {assigned_officer_id} status is '{assigned_officer['status']}', expected 'busy'")
            else:
                print(f"   ❌ Could not find officer {assigned_officer_id} in updated personnel list")
        
        return False, {}

    def test_resolve_incident(self, incident_id=None):
        """Test PATCH /api/incident/status - should resolve incident and free officer"""
        if not incident_id:
            # Create a test incident first
            incident_success, incident_response = self.test_create_incident()
            if not incident_success or not incident_response.get('success'):
                print("   ❌ Could not create test incident for resolution test")
                return False, {}
            incident_id = incident_response['id']
        
        resolve_data = {
            "incident_id": incident_id,
            "status": "resolved"
        }
        
        success, response = self.run_test(
            "Resolve Incident",
            "PATCH",
            "incident/status",
            200,
            data=resolve_data,
            expected_keys=["success", "incident_id", "status"]
        )
        
        if success and response.get('success'):
            print(f"   ✓ Incident {incident_id} resolved successfully")
            
            # Verify officer is freed
            personnel_success, officers = self.run_test(
                "Verify Officer Freed After Resolution",
                "GET",
                "personnel",
                200
            )
            
            if personnel_success:
                free_officers = [o for o in officers if o.get('status') == 'free']
                print(f"   Officers now free: {len(free_officers)}")
        
        return success, response

def main():
    print("🚀 Starting Election Patrol API Tests")
    print("=" * 50)
    
    tester = ElectionPatrolAPITester()
    
    # Test sequence
    print("\n📋 Running API Tests...")
    
    # 1. Test root endpoint
    tester.test_root_endpoint()
    
    # 2. Test personnel endpoint
    tester.test_get_personnel()
    
    # 3. Test incident creation and officer assignment
    tester.test_create_incident()
    
    # 4. Test officer status change after assignment
    status_success, status_data = tester.test_officer_status_after_assignment()
    
    # 5. Test incident resolution
    if status_success and 'incident_id' in status_data:
        tester.test_resolve_incident(status_data['incident_id'])
    else:
        tester.test_resolve_incident()
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("❌ Some tests failed")
        failed_tests = [t for t in tester.test_results if not t['success']]
        print("\nFailed tests:")
        for test in failed_tests:
            error_msg = test.get('error', f'Status {test.get("actual_status", "unknown")}')
            print(f"  - {test['name']}: {error_msg}")
        return 1

if __name__ == "__main__":
    sys.exit(main())