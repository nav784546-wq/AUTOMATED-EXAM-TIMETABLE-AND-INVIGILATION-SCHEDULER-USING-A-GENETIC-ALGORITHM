import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Cpu,
  Database,
  FileSpreadsheet,
  LogOut,
  Play,
  ShieldCheck,
  Building2,
  BookOpen,
  DoorOpen,
  Users,
  CalendarDays,
  Grid3X3,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  Menu,
  RotateCcw,
  Square,
  UserCog,
} from 'lucide-react';
import { LoginScreen } from './components/LoginScreen.jsx';
import { ResetPassword } from './components/auth/ResetPassword.jsx';
import { AdministratorManagementView } from './components/AdministratorManagementView.jsx';
import { OverviewDashboard } from './components/OverviewDashboard.jsx';
import { GASchedulerView } from './components/GASchedulerView.jsx';
import { EntityManagerView } from './components/EntityManagerView.jsx';
import { DepartmentManagementView } from './components/DepartmentManagementView.jsx';
import { SubjectManagementView } from './components/SubjectManagementView.jsx';
import { HallManagementView } from './components/HallManagementView.jsx';
import { FacultyManagementView } from './components/FacultyManagementView.jsx';
import { ExamSchedulerView } from './components/ExamSchedulerView.jsx';
import { SeatingArrangementView } from './components/SeatingArrangementView.jsx';
import { ConflictReportView } from './components/ConflictReportView.jsx';
import { ReportsExportView } from './components/ReportsExportView.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { ConfirmDialog } from './components/ConfirmDialog.jsx';
import { DashboardSkeleton } from './components/DashboardSkeleton.jsx';
import { useAuth } from './contexts/AuthContext.js';
import { persistenceService } from './services/persistenceService.js';
import { parsePasswordResetActionParams } from './utils/authErrors.js';
import { formatErrorMessage, useToastConfirm } from './hooks/useToastConfirm.js';
import { useExamEntities } from './hooks/useExamEntities.js';
import { useScheduleState } from './hooks/useScheduleState.js';
import { useFocusTrap } from './hooks/useFocusTrap.js';

const PAGE_TITLES = {
  overview: 'Examination Control Overview',
  ga: 'Genetic Algorithm Scheduler',
  'exam-scheduler': 'Visual Exam Scheduler',
  seating: 'Hall Seating Arrangement',
  conflicts: 'Conflict Report & Overrides',
  departments: 'Department Management',
  subjects: 'Subject Management',
  halls: 'Examination Hall Management',
  faculty: 'Faculty & Invigilator Management',
  entities: 'Examination Data Management',
  reports: 'Timetable & Invigilation Reports',
  'admin-management': 'Administrator Management',
};

export default function App() {
  const { user, loading: authLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const autostart =
    new URLSearchParams(location.search).get('autostart') === '1';

  const adminEmail =
    user?.email || user?.displayName || (autostart ? 'controller@university.edu' : '');

  const resetAction = useMemo(
    () => parsePasswordResetActionParams(location.search, location.pathname, location.hash),
    [location.search, location.pathname, location.hash]
  );

  const [loginReturnState, setLoginReturnState] = useState({
    email: '',
    resetSuccess: false,
  });

  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [undoBusy, setUndoBusy] = useState(false);

  const closeMobileNav = useCallback(() => {
    setIsMobileNavOpen(false);
  }, []);

  const mobileNavRef = useFocusTrap({
    isOpen: isMobileNavOpen,
    onClose: closeMobileNav,
    lockScroll: true,
  });

  const {
    statusBanner,
    showSuccess,
    showError,
    dismissBanner,
    confirmState,
    confirmLoading,
    requestDeleteConfirmation,
    handleConfirmDelete,
    cancelConfirmation,
  } = useToastConfirm();

  const {
    departmentRecords,
    departments,
    batches,
    sectionsByDept,
    subjects,
    halls,
    faculty,
    students,
    hallAllocations,
    exams,
    setEntitiesFromHydration,
    handleAddDepartment,
    handleRenameDepartment,
    handleDeleteDepartment,
    handleAddBatch,
    handleEditBatch,
    handleDeleteBatch,
    handleAddSubject,
    handleUpdateSubject,
    handleDeleteSubject,
    handleAddHall,
    handleUpdateHall,
    handleToggleHall,
    handleDeleteHall,
    handleAddFaculty,
    handleUpdateFaculty,
    handleToggleFaculty,
    handleDeleteFaculty,
    handleAddStudent,
    handleUpdateStudent,
    handleDeleteStudent,
    handleSaveHallAllocation,
    handleDeleteHallAllocation,
  } = useExamEntities({
    showSuccess,
    showError,
    requestDeleteConfirmation,
    actorEmail: adminEmail,
    actorUid: user?.uid || '',
  });

  const handleRequireGASetup = useCallback(() => {
    setActiveTab('ga');
  }, []);

  const {
    gaConfig,
    setGaConfig,
    savedGAConfig,
    isSavingGAConfig,
    handleSaveGAConfig,
    gaResult,
    activePolicy,
    scheduleValidation,
    timetableConfirmed,
    latestConflictReport,
    optimizationRuns,
    singleDaySelections,
    setSingleDaySelections,
    singleDayDate,
    setSingleDayDate,
    singleDaySession,
    setSingleDaySession,
    isGARunning,
    gaProgress,
    cancelGA,
    hydrateScheduleFromData,
    handleRunGA,
    handleFinalizeSingleDaySchedule,
    handleUpdateScheduledExam,
    handleBatchUpdateScheduledExams,
    handleOverrideFaculty,
    handleSaveConflictReport,
    handleConfirmFinalizeTimetable,
    handleRestoreOptimizationRun,
    handleDeleteOptimizationRun,
  } = useScheduleState({
    departmentRecords,
    departments,
    subjects,
    halls,
    faculty,
    students,
    exams,
    showSuccess,
    showError,
    onRequireGASetup: handleRequireGASetup,
    actorEmail: adminEmail,
    actorUid: user?.uid || '',
  });

  const hydrateFromDatabase = useCallback(async () => {
    setIsDataLoading(true);
    setLoadError(null);
    try {
      const data = await persistenceService.loadAllData();
      setEntitiesFromHydration(data);
      await hydrateScheduleFromData(data);
    } catch (err) {
      const msg = formatErrorMessage(err);
      setLoadError(msg);
      showError(msg);
    } finally {
      setIsDataLoading(false);
    }
  }, [setEntitiesFromHydration, hydrateScheduleFromData, showError]);

  useEffect(() => {
    if (resetAction?.isResetRoute) {
      setIsDataLoading(false);
      return;
    }
    if (authLoading && !autostart) return;
    if (!user && !autostart) {
      setIsDataLoading(false);
      return;
    }
    hydrateFromDatabase();
  }, [resetAction?.isResetRoute, authLoading, user, autostart, hydrateFromDatabase]);

  const handleReturnFromPasswordReset = useCallback(
    async (prefillEmail = '', resetSuccess = false) => {
      if (resetSuccess && user) {
        try {
          await logout();
        } catch {
          // Continue returning to login URL even if signOut rejects
        }
      }
      setLoginReturnState({
        email: String(prefillEmail || ''),
        resetSuccess: Boolean(resetSuccess),
      });
      navigate(resetSuccess ? '/?reset=success' : '/', { replace: true });
    },
    [user, logout, navigate]
  );

  const handleSignOut = async () => {
    try {
      await logout();
      if (autostart && typeof window !== 'undefined') {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        window.location.reload();
      }
    } catch (err) {
      showError(err);
    }
  };

  const handleUndoClick = async () => {
    if (!statusBanner?.onUndo || undoBusy) return;
    setUndoBusy(true);
    try {
      await statusBanner.onUndo();
    } finally {
      setUndoBusy(false);
    }
  };

  const navItems = useMemo(
    () => [
      { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
      { id: 'ga', label: 'GA Scheduler', icon: <Cpu className="w-4 h-4" /> },
      { id: 'exam-scheduler', label: 'Exam Scheduler', icon: <CalendarDays className="w-4 h-4" /> },
      { id: 'seating', label: 'Seating Plan', icon: <Grid3X3 className="w-4 h-4" /> },
      { id: 'conflicts', label: 'Conflict Report', icon: <AlertTriangle className="w-4 h-4" /> },
      { id: 'departments', label: 'Departments', icon: <Building2 className="w-4 h-4" /> },
      { id: 'subjects', label: 'Subjects', icon: <BookOpen className="w-4 h-4" /> },
      { id: 'halls', label: 'Halls', icon: <DoorOpen className="w-4 h-4" /> },
      { id: 'faculty', label: 'Faculty', icon: <Users className="w-4 h-4" /> },
      { id: 'entities', label: 'Manage Data', icon: <Database className="w-4 h-4" /> },
      { id: 'reports', label: 'Reports & Export', icon: <FileSpreadsheet className="w-4 h-4" /> },
      { id: 'admin-management', label: 'Admin Management', icon: <UserCog className="w-4 h-4" /> },
    ],
    []
  );

  const shouldRedirectToResetRoute =
    !resetAction.isResetPath && resetAction.isResetRoute;

  const protectedDashboard = shouldRedirectToResetRoute ? (
    <Navigate to={`/reset-password${location.search}${location.hash}`} replace />
  ) : (
    <ProtectedRoute
      fallback={
        <LoginScreen
          initialEmail={loginReturnState.email}
          initialResetSuccess={loginReturnState.resetSuccess}
        />
      }
    >
      <div className="min-h-screen bg-slate-50 text-slate-900 flex overflow-x-hidden">
        {isMobileNavOpen && (
          <div
            aria-hidden="true"
            onClick={closeMobileNav}
            className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden no-print"
          />
        )}

        <aside
          ref={mobileNavRef}
          role={isMobileNavOpen ? 'dialog' : undefined}
          aria-modal={isMobileNavOpen ? 'true' : undefined}
          aria-label="Sidebar Navigation"
          tabIndex={-1}
          data-testid="sidebar-nav"
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 no-print transition-transform duration-200 ease-out focus:outline-none lg:static lg:translate-x-0 ${
            isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex flex-col min-h-0 flex-1">
            <div className="h-16 px-5 lg:px-6 flex items-center justify-between gap-2.5 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span className="font-display font-bold text-base tracking-tight text-slate-900 whitespace-nowrap">
                  ExamGrid GA
                </span>
              </div>
              <button
                type="button"
                onClick={closeMobileNav}
                aria-label="Close navigation menu"
                className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="p-4 space-y-1 overflow-y-auto flex-1" aria-label="Main Navigation">
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`nav-${item.id}`}
                    onClick={() => {
                      setActiveTab(item.id);
                      closeMobileNav();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-4 border-t border-slate-200 space-y-3 shrink-0">
            <div className="px-2">
              <div className="text-xs font-medium text-slate-900 truncate">{adminEmail}</div>
              <div className="text-xs text-slate-500">Examination Controller</div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 shrink-0 no-print">
            <div className="flex items-center gap-2.5 text-sm min-w-0">
              <button
                type="button"
                onClick={() => setIsMobileNavOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={isMobileNavOpen}
                className="lg:hidden p-2 -ml-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="hidden sm:inline text-slate-400">ExamGrid</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{PAGE_TITLES[activeTab]}</h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isGARunning && (
                <button
                  type="button"
                  onClick={cancelGA}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5" />
                  Cancel GA
                </button>
              )}
              <button
                type="button"
                onClick={handleRunGA}
                disabled={isDataLoading || isGARunning}
                className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isGARunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {isGARunning
                    ? `Optimizing ${gaProgress?.percent ?? 0}%`
                    : 'Run GA Scheduler'}
                </span>
                <span className="sm:hidden">
                  {isGARunning ? `${gaProgress?.percent ?? 0}%` : 'Run GA'}
                </span>
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-4 min-w-0">
            {isGARunning && activeTab !== 'ga' && (
              <div
                data-testid="global-ga-progress-banner"
                className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-900 no-print"
              >
                <div className="flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 text-blue-700 animate-spin shrink-0" />
                  <span>
                    <strong className="font-semibold">Genetic Algorithm Running:</strong>{' '}
                    Generation{' '}
                    <span className="font-mono tabular-nums">
                      {gaProgress?.generation ?? 0}/{gaProgress?.totalGenerations ?? gaConfig.generations}
                    </span>{' '}
                    ({gaProgress?.percent ?? 0}%) · Best fitness{' '}
                    <span className="font-mono tabular-nums">{gaProgress?.bestFitness ?? 0}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={cancelGA}
                  className="px-2.5 py-1 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
                >
                  Cancel Optimization
                </button>
              </div>
            )}

            {statusBanner && (
              <div
                role="alert"
                data-testid="status-banner"
                className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-sm no-print ${
                  statusBanner.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  {statusBanner.type === 'error' ? (
                    <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  <span className="break-words">{statusBanner.message}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBanner.onUndo && (
                    <button
                      type="button"
                      disabled={undoBusy}
                      onClick={handleUndoClick}
                      data-testid="status-banner-undo"
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-900 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      {undoBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      {statusBanner.undoLabel || 'Undo'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={dismissBanner}
                    aria-label="Dismiss notification"
                    className="p-1 rounded hover:bg-black/5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {isDataLoading ? (
              <DashboardSkeleton />
            ) : loadError && departmentRecords.length === 0 ? (
              <div className="bg-white border border-red-200 rounded-xl p-8 text-center space-y-3">
                <p className="text-sm font-medium text-red-800">{loadError}</p>
                <button
                  type="button"
                  onClick={hydrateFromDatabase}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                >
                  Retry Database Connection
                </button>
              </div>
            ) : (
              <>
                {activeTab === 'overview' && (
                  <OverviewDashboard
                    gaResult={gaResult}
                    halls={halls}
                    faculty={faculty}
                    students={students}
                    departments={departments}
                    departmentRecords={departmentRecords}
                    subjects={subjects}
                    policy={activePolicy}
                    availableDates={gaConfig.availableDates}
                    isGARunning={isGARunning}
                    onRunGA={handleRunGA}
                    onUpdateScheduledExam={handleUpdateScheduledExam}
                    onBatchApplyQuickFix={handleBatchUpdateScheduledExams}
                    onNavigate={(tab) => setActiveTab(tab)}
                  />
                )}

                {activeTab === 'ga' && (
                  <GASchedulerView
                    config={gaConfig}
                    savedConfig={savedGAConfig}
                    isSavingConfig={isSavingGAConfig}
                    onSaveConfig={handleSaveGAConfig}
                    onChangeConfig={setGaConfig}
                    gaResult={gaResult}
                    optimizationRuns={optimizationRuns}
                    onRestoreOptimizationRun={handleRestoreOptimizationRun}
                    onDeleteOptimizationRun={handleDeleteOptimizationRun}
                    onRunGA={handleRunGA}
                    isGARunning={isGARunning}
                    gaProgress={gaProgress}
                    onCancelGA={cancelGA}
                    departments={departments}
                    subjects={subjects}
                    students={students}
                    batches={batches}
                    sectionsByDept={sectionsByDept}
                    singleDaySelections={singleDaySelections}
                    onChangeSingleDaySelections={setSingleDaySelections}
                    singleDayDate={singleDayDate}
                    onChangeSingleDayDate={setSingleDayDate}
                    singleDaySession={singleDaySession}
                    onChangeSingleDaySession={setSingleDaySession}
                    onFinalizeSingleDaySchedule={handleFinalizeSingleDaySchedule}
                  />
                )}

                {activeTab === 'exam-scheduler' && (
                  <ExamSchedulerView
                    departments={departments}
                    departmentRecords={departmentRecords}
                    batches={batches}
                    dates={gaConfig.availableDates}
                    halls={halls}
                    faculty={faculty}
                    subjects={subjects}
                    students={students}
                    schedule={gaResult.schedule}
                    policy={activePolicy}
                    scheduleValidation={scheduleValidation}
                    timetableConfirmed={timetableConfirmed}
                    onConfirmFinalizeTimetable={handleConfirmFinalizeTimetable}
                    singleDaySelections={singleDaySelections}
                    onChangeSingleDaySelections={setSingleDaySelections}
                    singleDayDate={singleDayDate}
                    onChangeSingleDayDate={setSingleDayDate}
                    singleDaySession={singleDaySession}
                    onChangeSingleDaySession={setSingleDaySession}
                    onFinalizeSingleDaySchedule={handleFinalizeSingleDaySchedule}
                    onUpdateScheduledExam={handleUpdateScheduledExam}
                  />
                )}

                {activeTab === 'seating' && (
                  <SeatingArrangementView
                    departments={departments}
                    students={students}
                    halls={halls}
                    schedule={gaResult.schedule}
                    availableDates={gaConfig.availableDates}
                    hallAllocations={hallAllocations}
                    onSaveHallAllocation={handleSaveHallAllocation}
                    onDeleteHallAllocation={handleDeleteHallAllocation}
                    showError={showError}
                  />
                )}

                {activeTab === 'conflicts' && (
                  <ConflictReportView
                    gaResult={gaResult}
                    faculty={faculty}
                    latestSavedReport={latestConflictReport}
                    onSaveConflictReport={handleSaveConflictReport}
                    onOverrideFaculty={handleOverrideFaculty}
                  />
                )}

                {activeTab === 'departments' && (
                  <DepartmentManagementView
                    departments={departments}
                    students={students}
                    faculty={faculty}
                    subjects={subjects}
                    onAddDepartment={handleAddDepartment}
                    onRenameDepartment={handleRenameDepartment}
                    onDeleteDepartment={handleDeleteDepartment}
                  />
                )}

                {activeTab === 'subjects' && (
                  <SubjectManagementView
                    departments={departments}
                    subjects={subjects}
                    onAddSubject={handleAddSubject}
                    onUpdateSubject={handleUpdateSubject}
                    onDeleteSubject={handleDeleteSubject}
                  />
                )}

                {activeTab === 'halls' && (
                  <HallManagementView
                    halls={halls}
                    onAddHall={handleAddHall}
                    onUpdateHall={handleUpdateHall}
                    onToggleHall={handleToggleHall}
                    onDeleteHall={handleDeleteHall}
                  />
                )}

                {activeTab === 'faculty' && (
                  <FacultyManagementView
                    departments={departments}
                    faculty={faculty}
                    onAddFaculty={handleAddFaculty}
                    onUpdateFaculty={handleUpdateFaculty}
                    onToggleFaculty={handleToggleFaculty}
                    onDeleteFaculty={handleDeleteFaculty}
                  />
                )}

                {activeTab === 'entities' && (
                  <EntityManagerView
                    departments={departments}
                    batches={batches}
                    sectionsByDept={sectionsByDept}
                    subjects={subjects}
                    halls={halls}
                    faculty={faculty}
                    students={students}
                    onAddDepartment={handleAddDepartment}
                    onRenameDepartment={handleRenameDepartment}
                    onDeleteDepartment={handleDeleteDepartment}
                    onAddBatch={handleAddBatch}
                    onEditBatch={handleEditBatch}
                    onDeleteBatch={handleDeleteBatch}
                    onAddSubject={handleAddSubject}
                    onDeleteSubject={handleDeleteSubject}
                    onAddHall={handleAddHall}
                    onToggleHall={handleToggleHall}
                    onDeleteHall={handleDeleteHall}
                    onAddFaculty={handleAddFaculty}
                    onToggleFaculty={handleToggleFaculty}
                    onDeleteFaculty={handleDeleteFaculty}
                    onAddStudent={handleAddStudent}
                    onUpdateStudent={handleUpdateStudent}
                    onDeleteStudent={handleDeleteStudent}
                  />
                )}

                {activeTab === 'reports' && <ReportsExportView gaResult={gaResult} />}

                {activeTab === 'admin-management' && (
                  <AdministratorManagementView
                    adminEmail={adminEmail}
                    adminUid={user?.uid || ''}
                    showSuccess={showSuccess}
                    showError={showError}
                    requestDeleteConfirmation={requestDeleteConfirmation}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        loading={confirmLoading}
        onConfirm={handleConfirmDelete}
        onCancel={cancelConfirmation}
      />
    </ProtectedRoute>
  );

  return (
    <Routes>
      <Route
        path="/reset-password"
        element={<ResetPassword onReturnToLogin={handleReturnFromPasswordReset} />}
      />
      <Route path="*" element={protectedDashboard} />
    </Routes>
  );
}
