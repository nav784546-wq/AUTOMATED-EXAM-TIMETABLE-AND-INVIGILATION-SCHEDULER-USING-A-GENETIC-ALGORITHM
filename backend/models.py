from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class DepartmentModel(BaseModel):
    id: Optional[str] = None
    name: str

class SubjectModel(BaseModel):
    id: Optional[str] = None
    code: str
    name: str
    department: str
    batch: str
    section: str = "Section A"
    semester: int = 1
    enrolledCount: int = 50

class HallModel(BaseModel):
    id: Optional[str] = None
    hallNumber: str
    building: str
    capacity: int
    available: bool = True

class FacultyModel(BaseModel):
    id: Optional[str] = None
    employeeId: str
    name: str
    department: str
    designation: str = "Assistant Prof."
    email: str
    phone: str = ""
    available: bool = True
    maxDuties: int = 4

class StudentModel(BaseModel):
    id: Optional[str] = None
    regNo: str
    name: str
    department: str
    section: str = "A"
    batch: str = "2024"
    semester: int = 1
    enrolledSubjectIds: List[str] = Field(default_factory=list)

class GAConfigRequest(BaseModel):
    populationSize: int = 40
    generations: int = 50
    mutationRate: float = 0.12
    crossoverRate: float = 0.8
    availableDates: List[str] = Field(
        default_factory=lambda: [
            "2026-11-16",
            "2026-11-17",
            "2026-11-18",
            "2026-11-19",
            "2026-11-20",
        ]
    )
    scope: str = "ALL"  # "ALL" (institution-wide) or "SELECTED" (department-specific)
    selectedDepartments: List[str] = Field(default_factory=list)
    selectedCourses: List[str] = Field(default_factory=list)
    selectedSections: List[str] = Field(default_factory=list)
    selectedBatches: List[str] = Field(default_factory=list)

class OverrideFacultyRequest(BaseModel):
    examId: str
    facultyId: str

class SubsectionDivisionRequest(BaseModel):
    department: str
    subsectionCount: int = 3
    applyToDatabase: bool = False

class SeatingPlanRequest(BaseModel):
    columnsPerRow: int = 6

class HallAllocationRequest(BaseModel):
    id: Optional[str] = None
    examDate: str
    session: str = "FN"
    selectedDepartments: List[str] = Field(default_factory=list)
    targetMode: str = "PERCENT_50"
    targetPercentage: Optional[int] = 50
    customTargetPerDept: int = 30
    maxDeptsPerHall: int = 2
    selectedHallIds: Optional[List[str]] = None
    reservedHallIds: Optional[List[str]] = None
    columnsPerRow: int = 5
    students: Optional[List[Dict[str, Any]]] = None
    halls: Optional[List[Dict[str, Any]]] = None
    allocations: Optional[List[Dict[str, Any]]] = None
    hallSummaries: Optional[List[Dict[str, Any]]] = None
    totalStudents: Optional[int] = None
    totalAllocated: Optional[int] = None
    hallsRequired: Optional[int] = None
    remainingAvailableCapacity: Optional[int] = None


class PasswordResetRequestModel(BaseModel):
    email: str


class PasswordResetTokenModel(BaseModel):
    resetToken: str


class PasswordResetConsumeModel(BaseModel):
    resetToken: Optional[str] = ""
    email: Optional[str] = ""


class AdminIdentitySyncModel(BaseModel):
    email: str
    firebaseUid: str
    role: Optional[str] = "admin"


class PasswordResetAuditEventModel(BaseModel):
    eventType: str
    outcome: str
    email: Optional[str] = ""
    firebaseUid: Optional[str] = ""
    errorCode: Optional[str] = ""
    failureReason: Optional[str] = ""
    metadata: Optional[Dict[str, Any]] = None


class AdminAccountCreateModel(BaseModel):
    email: str
    name: str
    role: Optional[str] = "admin"
    firebaseUid: Optional[str] = ""
    requesterEmail: Optional[str] = ""
    requesterUid: Optional[str] = ""


class AdminAccountUpdateModel(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    requesterEmail: Optional[str] = ""
    requesterUid: Optional[str] = ""


class SystemAuditLogCreateModel(BaseModel):
    category: str
    action: str
    summary: str
    outcome: Optional[str] = "SUCCESS"
    actorEmail: Optional[str] = ""
    actorUid: Optional[str] = ""
    actorRole: Optional[str] = ""
    targetType: Optional[str] = ""
    targetId: Optional[str] = ""
    targetLabel: Optional[str] = ""
    metadata: Optional[Dict[str, Any]] = None
