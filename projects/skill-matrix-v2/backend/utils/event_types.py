from enum import Enum

class SystemEventType(str, Enum):
    # Employee Management
    EMPLOYEE_CREATED = "EMPLOYEE_CREATED"
    EMPLOYEE_UPDATED = "EMPLOYEE_UPDATED"
    EMPLOYEE_DELETED = "EMPLOYEE_DELETED"
    
    # Skills Management
    EMPLOYEE_SKILLS_UPDATED = "EMPLOYEE_SKILLS_UPDATED"
    SKILL_MAPPING_CREATED = "SKILL_MAPPING_CREATED"
    SKILL_MAPPING_UPDATED = "SKILL_MAPPING_UPDATED"
    SKILL_MAPPING_DELETED = "SKILL_MAPPING_DELETED"
    
    # Training Management
    EMPLOYEE_TRAINING_UPDATED = "EMPLOYEE_TRAINING_UPDATED"
    TRAINING_MAPPING_CREATED = "TRAINING_MAPPING_CREATED"
    TRAINING_MAPPING_UPDATED = "TRAINING_MAPPING_UPDATED"
    TRAINING_MAPPING_DELETED = "TRAINING_MAPPING_DELETED"
    
    # Certificate Management
    EMPLOYEE_CERTIFICATE_UPDATED = "EMPLOYEE_CERTIFICATE_UPDATED"
    CERTIFICATE_MAPPING_CREATED = "CERTIFICATE_MAPPING_CREATED"
    CERTIFICATE_MAPPING_UPDATED = "CERTIFICATE_MAPPING_UPDATED"
    CERTIFICATE_MAPPING_DELETED = "CERTIFICATE_MAPPING_DELETED"

# List of all available events for the frontend dropdown
AVAILABLE_EVENTS = [
    {
        "id": SystemEventType.EMPLOYEE_CREATED.value,
        "name": "Employee Created",
        "description": "Triggered when an employee is created in the system."
    },
    {
        "id": SystemEventType.EMPLOYEE_UPDATED.value,
        "name": "Employee Updated",
        "description": "Triggered when an employee's details are updated."
    },
    {
        "id": SystemEventType.EMPLOYEE_DELETED.value,
        "name": "Employee Deleted",
        "description": "Triggered when an employee is deleted."
    },
    {
        "id": SystemEventType.EMPLOYEE_SKILLS_UPDATED.value,
        "name": "Employee Skills Updated",
        "description": "Triggered when an employee's assigned skills change."
    },
    {
        "id": SystemEventType.SKILL_MAPPING_CREATED.value,
        "name": "Skill Mapping Created",
        "description": "Triggered when a new master skill is created."
    },
    {
        "id": SystemEventType.SKILL_MAPPING_UPDATED.value,
        "name": "Skill Mapping Updated",
        "description": "Triggered when a master skill is updated."
    },
    {
        "id": SystemEventType.SKILL_MAPPING_DELETED.value,
        "name": "Skill Mapping Deleted",
        "description": "Triggered when a master skill is deleted."
    },
    {
        "id": SystemEventType.EMPLOYEE_TRAINING_UPDATED.value,
        "name": "Employee Training Updated",
        "description": "Triggered when training records for an employee change."
    },
    {
        "id": SystemEventType.TRAINING_MAPPING_CREATED.value,
        "name": "Training Mapping Created",
        "description": "Triggered when a new master training record is created."
    },
    {
        "id": SystemEventType.TRAINING_MAPPING_UPDATED.value,
        "name": "Training Mapping Updated",
        "description": "Triggered when a master training record is updated."
    },
    {
        "id": SystemEventType.TRAINING_MAPPING_DELETED.value,
        "name": "Training Mapping Deleted",
        "description": "Triggered when a master training record is deleted."
    },
    {
        "id": SystemEventType.EMPLOYEE_CERTIFICATE_UPDATED.value,
        "name": "Employee Certificate Updated",
        "description": "Triggered when an employee's assigned certificates change."
    },
    {
        "id": SystemEventType.CERTIFICATE_MAPPING_CREATED.value,
        "name": "Certificate Mapping Created",
        "description": "Triggered when a new master certificate record is created."
    },
    {
        "id": SystemEventType.CERTIFICATE_MAPPING_UPDATED.value,
        "name": "Certificate Mapping Updated",
        "description": "Triggered when a master certificate record is updated."
    },
    {
        "id": SystemEventType.CERTIFICATE_MAPPING_DELETED.value,
        "name": "Certificate Mapping Deleted",
        "description": "Triggered when a master certificate record is deleted."
    }
]
