import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { useSkills } from "../context/SkillContext";
import { useCertificates } from "../context/CertificateContext";
import { useSkillMatrixNav } from "../context/SkillMatrixNavContext";
import { useManagerApprovals } from "../context/ManagerApprovalsContext";
import { fetchTrainings } from "../helper/addTrainingV2Api";
import { getManagerStatsFromHierarchy } from "../helper/hierarchyUtils";
import { fetchCombinedHierarchy } from "../helper/hierarchyApi";
import axios from "axios";
import { BASE_URL } from "../config/apiConfig";

import EmployeeSkillTable from "./EmployeeSkillTable";
import EmployeeCertTable from "./EmployeeCertTable";
import ManagerDashboard from "../features/training/manager-dashboard/components/ManagerDashboard";
import SelfDashboard from "./SelfDashboard";
import EmployeeTrainingPanel from "../features/training/my-trainings/components/EmployeeTrainingPanel";
import LoadingSpinner from "../features/training/shared/components/LoadingSpinner";

function HomeScreen() {
  const { user } = useAuth();
  const {
    activeTab,
    homeClickCount,
    homeViewModeIntent,
    clearHomeViewModeIntent,
    homeOpenPanelIntent,
    clearHomeOpenPanelIntent,
  } = useSkillMatrixNav();
  // canViewOrgWide sourced from the context (single owner of this check —
  // see its own hasOrgWideViewAccess comment), not recomputed locally here
  // too — this is the ONE thing HomeScreen needs it for: widening
  // reachability into Manager Dashboard (below) and letting
  // SelfDashboard.jsx show its Self/Manager toggle to a non-manager Admin.
  // The toggle/scope-pill for org-wide data itself lives entirely in
  // ManagerDashboard.jsx (pulls orgWideView straight from
  // ManagerApprovalsContext too).
  const { setHierarchyData: setSharedHierarchyData, canViewOrgWide } = useManagerApprovals();

  // Panel: null | "skills" | "certs" | "trainings" — replaces the whole
  // view when set. Seeded from homeOpenPanelIntent (see
  // SkillMatrixNavContext.jsx) so clicking Training Batches' own "My
  // Trainings"/"Open for Enrollment" breadcrumb crumb lands back on that
  // exact view instead of the default Home dashboard — same
  // remounts-every-"home"-switch safety as homeViewMode below.
  const [openPanel, setOpenPanel] = useState(() => homeOpenPanelIntent?.panel || null);
  const [trainingsPanelInitialBucket, setTrainingsPanelInitialBucket] = useState(null);
  const [trainingsPanelInitialYear, setTrainingsPanelInitialYear] = useState(null);
  const [trainingsPanelInitialCatalogOpen, setTrainingsPanelInitialCatalogOpen] = useState(
    () => homeOpenPanelIntent?.catalogOpen || false
  );
  // One-shot deep-link: Pending Approvals (SelfDashboard.jsx) passes the
  // clicked training's own module name here so My Trainings opens already
  // search-filtered down to that one record, instead of the generic "All"
  // view the user then has to hunt through themselves.
  const [trainingsPanelInitialSearch, setTrainingsPanelInitialSearch] = useState(null);
  const [loading, setLoading] = useState(false);

  // "self" or "manager" — which dashboard view to show for managers. Seeded
  // from homeViewModeIntent (see SkillMatrixNavContext.jsx) so a "Back to
  // Manager Dashboard" click from Training Batches lands back on Manager
  // view instead of always resetting to Self — safe as a useState
  // initializer because HomeScreen fully remounts on every "home" tab
  // switch (see MainComponent.jsx's tabComponents[effectiveTab]).
  const [homeViewMode, setHomeViewMode] = useState(() => homeViewModeIntent || "self");

  // Consume the mount-time seed immediately so a later remount (e.g. a
  // plain sidebar → Home click with no intent) cannot replay it.
  useLayoutEffect(() => {
    clearHomeViewModeIntent();
  }, [clearHomeViewModeIntent]);

  // Reactive twin of the initializers above: other callers remount this
  // component before it runs (activeTab leaves "home" and comes back), but
  // `view=register` deep links can fire while already on Home -- this
  // catches that case too. Owns clearing the intent either way.
  useEffect(() => {
    if (!homeOpenPanelIntent) return;
    setOpenPanel(homeOpenPanelIntent.panel || null);
    setTrainingsPanelInitialCatalogOpen(homeOpenPanelIntent.catalogOpen || false);
    setTrainingsPanelInitialSearch(homeOpenPanelIntent.search || null); // same seed Pending Approvals uses
    clearHomeOpenPanelIntent();
  }, [homeOpenPanelIntent, clearHomeOpenPanelIntent]);
  
  // Remote data
  const { employeeSkills, fetchEmployeeSkills } = useSkills();
  const { employeeCertificates, fetchEmployeeCertificates } = useCertificates();
  const [trainings, setTrainings] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [hierarchyData, setHierarchyData] = useState(null);

  // Refs to avoid duplicate fetches across re-renders
  const hierarchyLoadedRef = useRef(false);
  const pendingRequestsLoadedRef = useRef(false);
  const lastUserIdRef = useRef(null);
  const certificatesFetchedRef = useRef(false);
  const skillsFetchedRef = useRef(false);

  const displayName = user?.displayName?.split(" ")[0] || "User";
  const userEmail = user?.mail || user?.userPrincipalName || "";

  // Trainings are fetched once on mount / numericEmployeeId change (this
  // component fully remounts whenever the user navigates back to the Home
  // tab, since MainComponent.jsx only ever renders one tab's subtree at a
  // time — that's what makes a just-submitted Open-for-Enrollment
  // nomination show up in the "Pending Approvals" widget (SelfDashboard.jsx)
  // and Training Progress card without a full page reload).
  const empIdForTrainings = user?.dbEmployeeId ?? user?.employeeId;
  const numericEmployeeId = empIdForTrainings != null
    ? (typeof empIdForTrainings === "string" ? parseInt(empIdForTrainings, 10) : Number(empIdForTrainings))
    : null;
  useEffect(() => {
    if (numericEmployeeId == null || isNaN(numericEmployeeId)) return;
    let cancelled = false;
    fetchTrainings({ employee_id: numericEmployeeId })
      .then((res) => { if (!cancelled) setTrainings(res.results || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [numericEmployeeId]);

  // ── Close panel when user navigates back to Home via sidebar ──
  // Skips its own first run: this effect fires after the INITIAL render
  // too (activeTab is already "home" the moment this component mounts,
  // since that's the only reason it's rendering at all), which used to
  // immediately null back out whatever openPanel's useState initializer
  // above just seeded from homeOpenPanelIntent — silently discarding the
  // Training Batches breadcrumb's "back to My Trainings/Open for
  // Enrollment" click every time. Real re-clicks of the sidebar's Home icon
  // while ALREADY mounted on Home (the actual case this effect exists for)
  // still bump homeClickCount and still close the panel correctly, since
  // by then this ref is no longer on its first run.
  const skippedFirstHomeResetRef = useRef(false);
  useEffect(() => {
    if (!skippedFirstHomeResetRef.current) {
      skippedFirstHomeResetRef.current = true;
      return;
    }
    if (activeTab === "home") {
      setOpenPanel(null);
    }
  }, [activeTab, homeClickCount]);

  // ── Restore cached data on mount ──
  useEffect(() => {
    if (user?.employeeId) {
      const cacheKey = `homeData_${user.employeeId}`;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.trainings) setTrainings(parsed.trainings);
          if (parsed.pendingRequests) setPendingRequests(parsed.pendingRequests);
          if (parsed.hierarchyLoaded) hierarchyLoadedRef.current = true;
          if (parsed.pendingRequestsLoaded) pendingRequestsLoadedRef.current = true;
          if (parsed.certificatesFetched) certificatesFetchedRef.current = true;
          if (parsed.skillsFetched) skillsFetchedRef.current = true;
        }
      } catch (err) {
        console.error("Error loading cached data:", err);
      }
    }
  }, [user?.employeeId]);

  // ── Reset fetch flags when user changes ──
  useEffect(() => {
    if (user?.employeeId && lastUserIdRef.current !== user.employeeId) {
      hierarchyLoadedRef.current = false;
      pendingRequestsLoadedRef.current = false;
      certificatesFetchedRef.current = false;
      skillsFetchedRef.current = false;
      lastUserIdRef.current = user.employeeId;
      if (lastUserIdRef.current) {
        sessionStorage.removeItem(`homeData_${lastUserIdRef.current}`);
      }
    }
  }, [user?.employeeId]);

  // ── Fetch all data (hierarchy, skills, certs, pending requests) ──
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadAllData = async () => {
      const email = userEmail.toLowerCase();
      let needsLoading = false;

      // Combined hierarchy (skills + certs + trainings in one call)
      const empIdNum = user?.dbEmployeeId ?? user?.employeeId;
      if (empIdNum != null && !hierarchyLoadedRef.current) {
        const numericId = typeof empIdNum === "string" ? parseInt(empIdNum, 10) : Number(empIdNum);
        if (!isNaN(numericId)) {
          hierarchyLoadedRef.current = true;
          needsLoading = true;
          try {
            const data = await fetchCombinedHierarchy(numericId);
            if (data) {
              setHierarchyData(data);
              setSharedHierarchyData(data);
              if (user?.employeeId) {
                const cacheKey = `homeData_${user.employeeId}`;
                try {
                  const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "{}");
                  cached.hierarchyLoaded = true;
                  sessionStorage.setItem(cacheKey, JSON.stringify(cached));
                } catch (e) {
                  console.error("Error caching hierarchy loaded state:", e);
                }
              }
            }
          } catch (err) {
            console.error("Error fetching hierarchy data:", err);
          }
        }
      }

      // Skills (once per session)
      let shouldFetchSkills = false;
      if (user?.employeeId) {
        const cacheKey = `homeData_${user.employeeId}`;
        try {
          const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "{}");
          if (!cached.skillsFetched) shouldFetchSkills = true;
          else skillsFetchedRef.current = true;
        } catch {
          shouldFetchSkills = !skillsFetchedRef.current;
        }
      } else {
        shouldFetchSkills = !skillsFetchedRef.current;
      }

      if (email && shouldFetchSkills) {
        skillsFetchedRef.current = true;
        if (user?.employeeId) {
          const cacheKey = `homeData_${user.employeeId}`;
          try {
            const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "{}");
            cached.skillsFetched = true;
            sessionStorage.setItem(cacheKey, JSON.stringify(cached));
          } catch (e) {
            console.error("Error caching skills fetched state:", e);
          }
        }
        needsLoading = true;
        await fetchEmployeeSkills(email);
      }

      // Certificates (once per session)
      const hasCertificatesData = employeeCertificates.length > 0;
      let shouldFetchCertificates = false;
      if (!hasCertificatesData) {
        if (user?.employeeId) {
          const cacheKey = `homeData_${user.employeeId}`;
          try {
            const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "{}");
            if (!cached.certificatesFetched) shouldFetchCertificates = true;
            else certificatesFetchedRef.current = true;
          } catch {
            shouldFetchCertificates = !certificatesFetchedRef.current;
          }
        } else {
          shouldFetchCertificates = !certificatesFetchedRef.current;
        }
      } else {
        certificatesFetchedRef.current = true;
        if (user?.employeeId) {
          const cacheKey = `homeData_${user.employeeId}`;
          try {
            const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "{}");
            cached.certificatesFetched = true;
            sessionStorage.setItem(cacheKey, JSON.stringify(cached));
          } catch (e) {
            console.error("Error caching certificates fetched state:", e);
          }
        }
      }

      if (email && shouldFetchCertificates && !hasCertificatesData) {
        certificatesFetchedRef.current = true;
        if (user?.employeeId) {
          const cacheKey = `homeData_${user.employeeId}`;
          try {
            const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "{}");
            cached.certificatesFetched = true;
            sessionStorage.setItem(cacheKey, JSON.stringify(cached));
          } catch (e) {
            console.error("Error caching certificates fetched state:", e);
          }
        }
        needsLoading = true;
        await fetchEmployeeCertificates(email);
      }

      // Pending skill-approval requests (managers only, once per session)
      const managerId = user?.dbEmployeeId || user?.employeeId;
      const numericManagerId = managerId ? Number(managerId) : null;
      if (user?.isManager && numericManagerId && !isNaN(numericManagerId) && !pendingRequestsLoadedRef.current) {
        needsLoading = true;
        pendingRequestsLoadedRef.current = true;
        try {
          const res = await axios.get(`${BASE_URL}get_pending_skill_request_v2`, {
            params: { 
              managerId: String(numericManagerId),
              isManager: String(user.isManager),
            },
            paramsSerializer: { indexes: null },
          });
          if (res.status === 200) {
            const requests = res.data?.requests || [];
            setPendingRequests(requests);
            if (user?.employeeId) {
              const cacheKey = `homeData_${user.employeeId}`;
              try {
                const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "{}");
                cached.pendingRequests = requests;
                cached.pendingRequestsLoaded = true;
                sessionStorage.setItem(cacheKey, JSON.stringify(cached));
              } catch (e) {
                console.error("Error caching pending requests:", e);
              }
            }
          }
        } catch (err) {
          console.error("Error fetching pending requests:", err);
          console.error("Error details:", {
            message: err.message,
            response: err.response?.data,
            status: err.response?.status,
            url: err.config?.url,
            params: err.config?.params,
          });
          setPendingRequests([]);
        }
      }

      if (needsLoading) setLoading(false);
    };

    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.dbEmployeeId, user?.employeeId, userEmail]);

  // ── Computed stats for the self (employee) dashboard ──
  const stats = useMemo(() => {
    const skills = hierarchyData?.skills;
    const certs = hierarchyData?.certifications;
    const trainingsData = hierarchyData?.trainings;

    const skillsByLevel = {
      L1: skills?.l1Count ?? 0,
      L2: skills?.l2Count ?? 0,
      L3: skills?.l3Count ?? 0,
    };

    const skillsByDomain = {};
    const skillArray = skills?.skillArray || [];
    if (skillArray.length > 0) {
      skillArray.forEach((domain) => {
        const domainName = domain.domainName || "Other";
        let count = 0;
        (domain.disciplines || []).forEach((disc) => {
          (disc.skillAreas || []).forEach((sa) => {
            count += (sa.frameworks || []).length;
          });
        });
        if (count > 0) skillsByDomain[domainName] = count;
      });
    } else {
      const approvedSkills = employeeSkills.filter(
        (s) => s.Status === "Approved" || s.approval_status === "Approved"
      );
      approvedSkills.forEach((skill) => {
        const domain = skill.domain_name || skill.Domain || "Other";
        skillsByDomain[domain] = (skillsByDomain[domain] || 0) + 1;
      });
    }

    const recentCert = certs?.recentCertificateName
      ?? (() => {
          const sortedCerts = [...employeeCertificates]
            .filter((c) => c.approvalStatus === "Approved")
            .sort((a, b) => {
              const dateA = a.certificateDate || a.certDate || "";
              const dateB = b.certificateDate || b.certDate || "";
              return dateB.localeCompare(dateA);
            });
          return sortedCerts[0]?.certificateName || sortedCerts[0]?.certName || "None";
        })();

    const completedTrainings = trainingsData?.completedTrainingCount
      ?? trainings.filter((t) => {
          const status = t.trainingStatus || t.status || t.Status || t.training_status || "";
          return status === "Completed" || status === "completed";
        }).length;

    const now = new Date();
    const certArray = certs?.certificationArray || employeeCertificates;
    const expiringCerts = certArray.filter((cert) => {
      const expiry = cert.expiryDate;
      if (!expiry) return false;
      const expiryDate = new Date(expiry);
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry > 0 && daysUntilExpiry <= 90;
    });

    const allDates = [
      ...trainings.map((t) => t.startDate || t.endDate || t.start_date || t.updated_at || t.created_at),
      ...employeeCertificates.map((c) => c.updated_at || c.UpdatedAt || c.created_at || c.CreatedAt),
    ].filter(Boolean);
    const lastUpdated = allDates.length > 0
      ? new Date(Math.max(...allDates.map((d) => new Date(d))))
      : null;
    const daysSinceUpdate = lastUpdated
      ? Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24))
      : null;

    const rejectedSkills = employeeSkills.filter(
      (s) => s.Status === "Rejected" || s.approval_status === "Rejected"
    );

    return {
      totalSkills: skills?.activeSkillsCount ?? employeeSkills.length,
      pendingApprovals: (skills?.pendingApprovalCount ?? 0) + pendingRequests.length,
      totalCertificates: certs?.certificationCount ?? employeeCertificates.filter((c) => c.approvalStatus === "Approved").length,
      totalTrainings: trainingsData?.trainingCount ?? trainings.length,
      completedTrainings,
      recentCertification: recentCert,
      skillsByLevel,
      skillsByDomain,
      expiringCerts: expiringCerts.length,
      daysSinceUpdate,
      rejectedSkills: rejectedSkills.length,
    };
  }, [hierarchyData, employeeSkills, employeeCertificates, trainings, pendingRequests]);

  // ── Computed stats for the manager dashboard ──
  // canViewOrgWide also passes this gate (not just isManager) — an Admin
  // has no reports of their own, so isManager is false for them, but they
  // still need SOME non-null stats object here to get past the render gate
  // below (this doesn't require org-wide to already be ON: reachability
  // and "which data is actually shown" are separate concerns now — see
  // ManagerDashboard.jsx's own mount effect, which defaults a non-manager
  // Admin straight to its Entire Organization scope-pill option). This
  // value is only a brief fallback either way: ManagerDashboard.jsx's own
  // liveHierarchyData (synced from ManagerApprovalsContext) takes over the
  // instant its own org-wide fetch resolves — see that file's own
  // scopedManagerStats comment.
  const managerStats = useMemo(() => {
    if (!(user?.isManager || canViewOrgWide) || !hierarchyData) return null;
    return getManagerStatsFromHierarchy(hierarchyData);
  }, [user?.isManager, canViewOrgWide, hierarchyData]);

  const currentEmployeeId = user?.dbEmployeeId ?? user?.employeeId ?? null;

  // ── Inline panel views (replace the whole screen) ──
  if (openPanel === "skills") {
    return (
      <div className="flex flex-col h-full min-h-0 text-gray-800 dark:text-gray-200">
        <div className="flex-1 min-h-0 overflow-auto overscroll-y-contain">
          <EmployeeSkillTable />
        </div>
      </div>
    );
  }

  if (openPanel === "trainings") {
    return (
      <div className="flex flex-col h-full min-h-0 text-gray-800 dark:text-gray-200">
        <div className="flex-1 min-h-0 overflow-auto overscroll-y-contain">
          <EmployeeTrainingPanel
            trainings={trainings}
            employeeId={currentEmployeeId}
            initialBucket={trainingsPanelInitialBucket}
            initialYear={trainingsPanelInitialYear}
            initialCatalogOpen={trainingsPanelInitialCatalogOpen}
            initialSearch={trainingsPanelInitialSearch}
            onBack={() => setOpenPanel(null)}
          />
        </div>
      </div>
    );
  }

  if (openPanel === "certs") {
    return (
      <div className="flex flex-col h-full min-h-0 p-4 text-gray-800 dark:text-gray-200">
        <div className="flex items-center gap-3 shrink-0 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Upload New Certificate</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-auto overscroll-y-contain">
          <EmployeeCertTable />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <LoadingSpinner label="Loading your dashboard..." />
      </div>
    );
  }

  // ── Manager dashboard view (a real manager, OR an Admin — see
  //    canViewOrgWide above; ManagerDashboard.jsx handles defaulting a
  //    non-manager Admin into its own Entire Organization scope) ──
  if ((user?.isManager || canViewOrgWide) && managerStats && homeViewMode === "manager") {
    return (
      <ManagerDashboard
        managerStats={managerStats}
        stats={stats}
        displayName={displayName}
        homeViewMode={homeViewMode}
        setHomeViewMode={setHomeViewMode}
        hierarchyDataForTrainingWidget={hierarchyData}
        isManager={!!user?.isManager}
      />
    );
  }

  // ── Employee self-view (default) ──
  return (
    <SelfDashboard
      stats={stats}
      trainings={trainings}
      displayName={displayName}
      homeViewMode={homeViewMode}
      setHomeViewMode={setHomeViewMode}
      isManager={!!user?.isManager}
      canViewOrgWide={canViewOrgWide}
      onOpenSkillsPanel={() => setOpenPanel("skills")}
      onOpenCertsPanel={() => setOpenPanel("certs")}
      onOpenTrainingsPanel={(bucket, year, openCatalog = false, search = "") => { // Home links start with an empty search
        setTrainingsPanelInitialBucket(bucket);
        setTrainingsPanelInitialYear(year);
        setTrainingsPanelInitialCatalogOpen(openCatalog);
        setTrainingsPanelInitialSearch(search);
        setOpenPanel("trainings");
      }}
    />
  );
}

export default HomeScreen;
