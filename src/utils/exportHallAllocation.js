import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  buildCombinedHallReportRows,
  buildDepartmentWiseHallReportRows,
  buildIndividualStudentHallRows,
} from './seatingAllocator.js';

function formatSessionLabel(session) {
  if (session === 'FN') return 'FN (Forenoon 09:30 - 12:30)';
  if (session === 'AN') return 'AN (Afternoon 14:00 - 17:00)';
  return String(session || 'FN');
}

function buildSafeFileStem(plan, meta = {}) {
  const datePart = String(plan?.examDate || meta.examDate || 'session').replace(/[^a-zA-Z0-9_-]/g, '-');
  const sessionPart = String(plan?.session || meta.session || 'FN').replace(/[^a-zA-Z0-9_-]/g, '-');
  return `hall_allocation_${datePart}_${sessionPart}`;
}

export function downloadHallAllocationPDF(plan, reportType = 'COMBINED', meta = {}) {
  if (!plan) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const examDate = plan.examDate || meta.examDate || 'Scheduled Session';
  const sessionLabel = formatSessionLabel(plan.session || meta.session);
  const departmentsText = (plan.selectedDepartments || []).join(', ') || 'All Departments';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('Examination Hall Allocation Report', 40, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Exam Date: ${examDate}   |   Session: ${sessionLabel}`, 40, 64);

  const wrappedDepts = doc.splitTextToSize(`Departments: ${departmentsText}`, pageWidth - 80);
  doc.text(wrappedDepts, 40, 80);

  const afterDeptY = 80 + wrappedDepts.length * 12;
  doc.text(
    `Total Students: ${plan.totalAllocated ?? 0} / ${plan.totalStudents ?? 0}   |   Halls Used: ${plan.hallsRequired ?? 0}   |   Remaining Capacity: ${plan.remainingAvailableCapacity ?? 0}`,
    40,
    afterDeptY + 4
  );

  let cursorY = afterDeptY + 24;

  const renderDeptWiseTable = () => {
    const deptFilter = meta.departmentFilter || 'ALL';
    const rows = buildDepartmentWiseHallReportRows(plan, deptFilter);
    const singleDeptOnly =
      deptFilter !== 'ALL' || (plan.selectedDepartments || []).length <= 1;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(
      singleDeptOnly && (deptFilter !== 'ALL' || plan.selectedDepartments?.[0])
        ? `Department-Wise Hall Allocation — ${deptFilter !== 'ALL' ? deptFilter : plan.selectedDepartments[0]}`
        : 'Department-Wise Hall Allocation',
      40,
      cursorY
    );

    const head = singleDeptOnly
      ? [['Examination Hall', 'Registration Number Range', 'Students']]
      : [['Examination Hall', 'Department', 'Registration Number Range', 'Students']];

    const body = rows.map((r) =>
      singleDeptOnly
        ? [
            `${r.hallNumber}${r.building ? ` (${r.building})` : ''}`,
            r.regNoRange,
            String(r.studentCount),
          ]
        : [
            `${r.hallNumber}${r.building ? ` (${r.building})` : ''}`,
            r.department,
            r.regNoRange,
            String(r.studentCount),
          ]
    );

    autoTable(doc, {
      startY: cursorY + 8,
      head,
      body,
      styles: { fontSize: 9, cellPadding: 6, textColor: [15, 23, 42] },
      headStyles: { fillColor: [29, 78, 216], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: singleDeptOnly
        ? {
            1: { font: 'courier', fontStyle: 'bold' },
            2: { halign: 'right', font: 'courier' },
          }
        : {
            2: { font: 'courier', fontStyle: 'bold' },
            3: { halign: 'right', font: 'courier' },
          },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    cursorY = doc.lastAutoTable.finalY + 22;
  };

  const renderCombinedTable = () => {
    const rows = buildCombinedHallReportRows(plan);
    const maxDepts = plan.maxDeptsPerHall || 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`Combined Department Hall Allocation (Max ${maxDepts} Department${maxDepts > 1 ? 's' : ''} per Hall)`, 40, cursorY);

    autoTable(doc, {
      startY: cursorY + 8,
      head: [['Examination Hall', 'Department', 'Registration Number Range', 'Students']],
      body: rows.map((r) => [
        r.isFirstDeptInHall
          ? `${r.hallNumber} (${r.hallTotalAllocated}/${r.hallCapacity})`
          : '',
        r.department,
        r.regNoRange,
        String(r.studentCount),
      ]),
      styles: { fontSize: 9, cellPadding: 6, textColor: [15, 23, 42] },
      headStyles: { fillColor: [29, 78, 216], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        2: { font: 'courier', fontStyle: 'bold' },
        3: { halign: 'right', font: 'courier' },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    cursorY = doc.lastAutoTable.finalY + 22;
  };

  const renderIndividualTable = () => {
    const rows = buildIndividualStudentHallRows(plan);
    if (cursorY > 650) {
      doc.addPage();
      cursorY = 44;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Student Individual Hall Allocation List', 40, cursorY);

    autoTable(doc, {
      startY: cursorY + 8,
      head: [['S.No.', 'Registration Number', 'Student Name', 'Department', 'Examination Hall']],
      body: rows.map((r) => [
        String(r.sNo),
        r.regNo,
        r.studentName,
        r.department,
        r.hallNumber,
      ]),
      styles: { fontSize: 8.5, cellPadding: 5, textColor: [15, 23, 42] },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'right', font: 'courier', cellWidth: 42 },
        1: { font: 'courier', fontStyle: 'bold' },
        4: { font: 'courier', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  };

  if (reportType === 'DEPT_WISE') {
    renderDeptWiseTable();
  } else if (reportType === 'INDIVIDUAL') {
    renderIndividualTable();
  } else if (reportType === 'ALL') {
    renderCombinedTable();
    renderIndividualTable();
  } else {
    renderCombinedTable();
  }

  doc.save(`${buildSafeFileStem(plan, meta)}.pdf`);
}

export function downloadHallAllocationExcel(plan, meta = {}) {
  if (!plan) return;
  const wb = XLSX.utils.book_new();
  const pct = plan.targetPercentage || 50;
  const maxDepts = plan.maxDeptsPerHall || 2;

  const summarySheetData = [
    ['Examination Hall Allocation Summary'],
    ['Exam Date', plan.examDate || meta.examDate || ''],
    ['Session', formatSessionLabel(plan.session || meta.session)],
    ['Departments', (plan.selectedDepartments || []).join(', ')],
    [
      'Target Allocation Rule',
      plan.targetMode === 'CUSTOM'
        ? `${plan.customTargetPerDept} students per dept/hall`
        : `${pct}% of class strength per dept/hall`,
    ],
    ['Max Departments per Hall', maxDepts],
    ['Total Eligible Students', plan.totalStudents ?? 0],
    ['Total Allocated Students', plan.totalAllocated ?? 0],
    ['Halls Used', plan.hallsRequired ?? 0],
    ['Remaining Available Capacity', plan.remainingAvailableCapacity ?? 0],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const deptFilter = meta.departmentFilter || 'ALL';
  const deptWiseRows = buildDepartmentWiseHallReportRows(plan, deptFilter);
  const wsDept = XLSX.utils.json_to_sheet(
    deptWiseRows.map((r) => ({
      'Examination Hall': r.hallNumber,
      Building: r.building || '',
      Department: r.department,
      'Registration Number Range': r.regNoRange,
      Students: r.studentCount,
      'Hall Capacity': r.hallCapacity,
    }))
  );
  wsDept['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 30 }, { wch: 26 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsDept, 'Dept-Wise Allocation');

  const combinedRows = buildCombinedHallReportRows(plan);
  const wsCombined = XLSX.utils.json_to_sheet(
    combinedRows.map((r) => ({
      'Examination Hall': r.hallNumber,
      Department: r.department,
      'Registration Number Range': r.regNoRange,
      Students: r.studentCount,
      'Hall Occupied': `${r.hallTotalAllocated} / ${r.hallCapacity}`,
    }))
  );
  wsCombined['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 26 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsCombined, 'Combined Hall Report');

  const individualRows = buildIndividualStudentHallRows(plan);
  const wsIndividual = XLSX.utils.json_to_sheet(
    individualRows.map((r) => ({
      'S.No.': r.sNo,
      'Registration Number': r.regNo,
      'Student Name': r.studentName,
      Department: r.department,
      'Examination Hall': r.hallNumber,
      Seat: `S${r.seatNumber}`,
    }))
  );
  wsIndividual['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 28 }, { wch: 30 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsIndividual, 'Student Individual List');

  XLSX.writeFile(wb, `${buildSafeFileStem(plan, meta)}.xlsx`);
}
