import { useState, useMemo } from 'react';
import {
  Users, Building2, Search, ChevronDown, ChevronUp,
  IndianRupee, Calendar, UtensilsCrossed, Download,
  CheckCircle2, XCircle, AlertCircle, TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Employee Data (from ATTENDANCE_APRIL_2026.xlsx) ──────────────────────────
interface Employee {
  id: string; name: string; branch: 'VRSNB' | 'Cafe Aadvikam' | 'SNB';
  department: string; grossSalary: number; salaryAdvance: number;
  canteenDeduction: number; uniformDeduction: number; otherDeduction: number;
  netSalary: number; accountNumber: string; bankName: string;
  bankBranch: string; ifscCode: string;
}

// Attendance record stored per-employee per-day in localStorage
interface DayAttendance { present: boolean; bf: boolean; lunch: boolean; dinner: boolean; }
type MonthAttendance = Record<string, DayAttendance>; // key = "empId_day"

const SEED_EMPLOYEES: Employee[] = [
  { id: 'emp_1', name: 'Harshawardini S', branch: 'VRSNB', department: 'ADMIN OFFICE STAFFS', grossSalary: 18000, salaryAdvance: 0, canteenDeduction: 520, uniformDeduction: 0, otherDeduction: 0, netSalary: 14480, accountNumber: '41938132346', bankName: 'STATE BANK OF INDIA', bankBranch: 'KUNIAMUTHUR', ifscCode: 'SBIN0012245' },
  { id: 'emp_2', name: 'Muniratnam.M', branch: 'VRSNB', department: 'ADMIN OFFICE STAFFS', grossSalary: 60000, salaryAdvance: 0, canteenDeduction: 210, uniformDeduction: 0, otherDeduction: 0, netSalary: 53790, accountNumber: '32070316447', bankName: 'STATE BANK OF INDIA', bankBranch: 'KAMANDODDI', ifscCode: 'SBIN0008114' },
  { id: 'emp_3', name: 'Rajesh M', branch: 'VRSNB', department: 'ADMIN OFFICE STAFFS', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 210, uniformDeduction: 0, otherDeduction: 0, netSalary: 14807, accountNumber: '211701000015676', bankName: 'INDIAN OVERSEAS BANK', bankBranch: 'HOSUR', ifscCode: 'IOBA0002117' },
  { id: 'emp_4', name: 'Shilpa.K', branch: 'VRSNB', department: 'ADMIN OFFICE STAFFS', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 10, uniformDeduction: 0, otherDeduction: 0, netSalary: 13023, accountNumber: '6391131749', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_5', name: 'Sivaranjani R', branch: 'VRSNB', department: 'ADMIN OFFICE STAFFS', grossSalary: 25000, salaryAdvance: 0, canteenDeduction: 590, uniformDeduction: 0, otherDeduction: 0, netSalary: 21910, accountNumber: '44573403374', bankName: 'STATE BANK OF INDIA', bankBranch: 'GOPALAPURAM', ifscCode: 'SBIN0000962' },
  { id: 'emp_6', name: 'Yasodharan A', branch: 'VRSNB', department: 'ADMIN OFFICE STAFFS', grossSalary: 29000, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 25133, accountNumber: '50100220445050', bankName: 'HDFC BANK', bankBranch: 'PONDICHERRY', ifscCode: 'HDFC0001278' },
  { id: 'emp_7', name: 'Sekar S', branch: 'VRSNB', department: 'ADMIN OFFICE STAFFS', grossSalary: 0, salaryAdvance: 0, canteenDeduction: 110, uniformDeduction: 0, otherDeduction: 0, netSalary: -110, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_8', name: 'Nithin R', branch: 'VRSNB', department: 'ADMIN OFFICE STAFFS', grossSalary: 28000, salaryAdvance: 0, canteenDeduction: 150, uniformDeduction: 0, otherDeduction: 0, netSalary: 14783, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_9', name: 'Gowrishankar', branch: 'VRSNB', department: 'STORE STAFFS', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 240, uniformDeduction: 0, otherDeduction: 0, netSalary: 6560, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_10', name: 'Meracline', branch: 'VRSNB', department: 'STORE STAFFS', grossSalary: 15000, salaryAdvance: 0, canteenDeduction: 180, uniformDeduction: 0, otherDeduction: 0, netSalary: 13320, accountNumber: '6459259743', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_11', name: 'Padma', branch: 'VRSNB', department: 'STORE STAFFS', grossSalary: 12000, salaryAdvance: 0, canteenDeduction: 130, uniformDeduction: 0, otherDeduction: 0, netSalary: 10270, accountNumber: '6310475833', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_12', name: 'Sathrohan', branch: 'VRSNB', department: 'STORE STAFFS', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 240, uniformDeduction: 0, otherDeduction: 0, netSalary: 6560, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_13', name: 'Suresh Kumar R', branch: 'VRSNB', department: 'STORE STAFFS', grossSalary: 30000, salaryAdvance: 0, canteenDeduction: 670, uniformDeduction: 0, otherDeduction: 0, netSalary: 26330, accountNumber: '7162192844', bankName: 'INDIAN BANK', bankBranch: 'SURIYUR', ifscCode: 'IDIB000S058' },
  { id: 'emp_14', name: 'Amit', branch: 'VRSNB', department: 'PACKING STAFFS', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 720, uniformDeduction: 0, otherDeduction: 0, netSalary: 14580, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_15', name: 'Hussain', branch: 'VRSNB', department: 'PACKING STAFFS', grossSalary: 23000, salaryAdvance: 5000, canteenDeduction: 410, uniformDeduction: 450, otherDeduction: 0, netSalary: 17907, accountNumber: '1405155000060588', bankName: 'KARUR VYSYA BANK', bankBranch: 'KURNOOL', ifscCode: 'KVBL0001405' },
  { id: 'emp_16', name: 'Kalavathi', branch: 'VRSNB', department: 'PACKING STAFFS', grossSalary: 10000, salaryAdvance: 0, canteenDeduction: 160, uniformDeduction: 0, otherDeduction: 0, netSalary: 8840, accountNumber: '10231296647', bankName: 'TAMILNADU GRAMA BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB0PLB001' },
  { id: 'emp_17', name: 'Kalavathi V', branch: 'VRSNB', department: 'PACKING STAFFS', grossSalary: 10000, salaryAdvance: 0, canteenDeduction: 230, uniformDeduction: 0, otherDeduction: 0, netSalary: 8770, accountNumber: '888952120', bankName: 'INDIAN BANK', bankBranch: 'SHOOLAGIRI', ifscCode: 'IDIB000S023' },
  { id: 'emp_18', name: 'Lal Babu', branch: 'VRSNB', department: 'PACKING STAFFS', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 210, uniformDeduction: 0, otherDeduction: 0, netSalary: 6023, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_19', name: 'Monish', branch: 'VRSNB', department: 'PACKING STAFFS', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 160, uniformDeduction: 0, otherDeduction: 0, netSalary: 6640, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_20', name: 'Roopakala', branch: 'VRSNB', department: 'PACKING STAFFS', grossSalary: 12000, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 10800, accountNumber: '850917530', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_21', name: 'Sudha', branch: 'VRSNB', department: 'PACKING STAFFS', grossSalary: 10000, salaryAdvance: 0, canteenDeduction: 170, uniformDeduction: 0, otherDeduction: 0, netSalary: 7497, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_22', name: 'Anand Kumar', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 15000, salaryAdvance: 0, canteenDeduction: 390, uniformDeduction: 0, otherDeduction: 0, netSalary: 8110, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_23', name: 'Annamalai', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 27000, salaryAdvance: 5000, canteenDeduction: 490, uniformDeduction: 845, otherDeduction: 0, netSalary: 19765, accountNumber: '6127372019', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_24', name: 'Bharath', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 17000, salaryAdvance: 2000, canteenDeduction: 660, uniformDeduction: 0, otherDeduction: 0, netSalary: 13207, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_25', name: 'Birju Kumar', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 16000, salaryAdvance: 0, canteenDeduction: 390, uniformDeduction: 0, otherDeduction: 0, netSalary: 8677, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_26', name: 'Manjunath', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 38000, salaryAdvance: 0, canteenDeduction: 450, uniformDeduction: 845, otherDeduction: 0, netSalary: 32905, accountNumber: '6505441406', bankName: 'INDIAN BANK', bankBranch: 'SHOOLAGIRI', ifscCode: 'IDIB000S023' },
  { id: 'emp_27', name: 'Rahul Roy', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 15000, salaryAdvance: 0, canteenDeduction: 190, uniformDeduction: 0, otherDeduction: 0, netSalary: 5310, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_28', name: 'Santhosh', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 18000, salaryAdvance: 0, canteenDeduction: 240, uniformDeduction: 845, otherDeduction: 0, netSalary: 7915, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_29', name: 'Saravanan', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 24000, salaryAdvance: 0, canteenDeduction: 490, uniformDeduction: 845, otherDeduction: 0, netSalary: 21865, accountNumber: '6099410066', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_30', name: 'Uppendea Kumar', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 15000, salaryAdvance: 0, canteenDeduction: 410, uniformDeduction: 0, otherDeduction: 0, netSalary: 8590, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_31', name: 'Vijay', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 27000, salaryAdvance: 0, canteenDeduction: 450, uniformDeduction: 845, otherDeduction: 0, netSalary: 23005, accountNumber: '6332515283', bankName: 'INDIAN BANK', bankBranch: 'KRISHNAGIRI', ifscCode: 'IDIB000K052' },
  { id: 'emp_32', name: 'Seshadri', branch: 'VRSNB', department: 'BAKERY STAFFS', grossSalary: 0, salaryAdvance: 0, canteenDeduction: 250, uniformDeduction: 450, otherDeduction: 0, netSalary: -700, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_33', name: 'Jothi.R', branch: 'VRSNB', department: 'CAKE STAFFS', grossSalary: 42000, salaryAdvance: 0, canteenDeduction: 670, uniformDeduction: 845, otherDeduction: 0, netSalary: 39085, accountNumber: '110295875910', bankName: 'CANARA BANK', bankBranch: 'HOSUR', ifscCode: 'CNRB0004385' },
  { id: 'emp_34', name: 'Ravindra', branch: 'VRSNB', department: 'CAKE STAFFS', grossSalary: 15000, salaryAdvance: 0, canteenDeduction: 420, uniformDeduction: 0, otherDeduction: 0, netSalary: 8580, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_35', name: 'Bharath Kumar', branch: 'VRSNB', department: 'SWEETS STAFFS', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 240, uniformDeduction: 0, otherDeduction: 0, netSalary: 6560, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_36', name: 'Kannan', branch: 'VRSNB', department: 'SWEETS STAFFS', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 660, uniformDeduction: 0, otherDeduction: 0, netSalary: 14640, accountNumber: '7478743974', bankName: 'INDIAN BANK', bankBranch: 'RAYAKOTTAI', ifscCode: 'IDIB000R020' },
  { id: 'emp_37', name: 'Lokesh', branch: 'VRSNB', department: 'SWEETS STAFFS', grossSalary: 36000, salaryAdvance: 0, canteenDeduction: 320, uniformDeduction: 845, otherDeduction: 0, netSalary: 31235, accountNumber: '461701500376', bankName: 'ICICI BANK', bankBranch: 'TRICHI', ifscCode: 'ICIC0004617' },
  { id: 'emp_38', name: 'Shiva Kumar V', branch: 'VRSNB', department: 'SWEETS STAFFS', grossSalary: 33000, salaryAdvance: 0, canteenDeduction: 390, uniformDeduction: 845, otherDeduction: 0, netSalary: 29565, accountNumber: '6929867250', bankName: 'INDIAN BANK', bankBranch: 'NACHIKUPPAM', ifscCode: 'IDIB000N174' },
  { id: 'emp_39', name: 'Murali', branch: 'VRSNB', department: 'SAVOURIES STAFFS', grossSalary: 28000, salaryAdvance: 0, canteenDeduction: 250, uniformDeduction: 0, otherDeduction: 0, netSalary: 24950, accountNumber: '923010022700394', bankName: 'AXIS BANK', bankBranch: 'COIMBATORE', ifscCode: 'UTIB0000090' },
  { id: 'emp_40', name: 'Shiva Kumar M', branch: 'VRSNB', department: 'SAVOURIES STAFFS', grossSalary: 24000, salaryAdvance: 0, canteenDeduction: 420, uniformDeduction: 0, otherDeduction: 0, netSalary: 20380, accountNumber: '963526595', bankName: 'INDIAN BANK', bankBranch: 'KANNANDAHALLI', ifscCode: 'IDIB000K076' },
  { id: 'emp_41', name: 'Silambarasan', branch: 'VRSNB', department: 'SAVOURIES STAFFS', grossSalary: 28000, salaryAdvance: 0, canteenDeduction: 280, uniformDeduction: 0, otherDeduction: 0, netSalary: 22120, accountNumber: '50100501047237', bankName: 'HDFC BANK', bankBranch: 'GANDHIPURAM', ifscCode: 'HDFC0001588' },
  { id: 'emp_42', name: 'Kargamma', branch: 'VRSNB', department: 'HOUSE KEEPING', grossSalary: 12000, salaryAdvance: 0, canteenDeduction: 360, uniformDeduction: 0, otherDeduction: 0, netSalary: 10440, accountNumber: '820303706', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_43', name: 'Ramadevi', branch: 'VRSNB', department: 'HOUSE KEEPING', grossSalary: 13000, salaryAdvance: 0, canteenDeduction: 290, uniformDeduction: 0, otherDeduction: 0, netSalary: 8810, accountNumber: '886283910', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_44', name: 'Sindhu', branch: 'VRSNB', department: 'HOUSE KEEPING', grossSalary: 15000, salaryAdvance: 3000, canteenDeduction: 350, uniformDeduction: 0, otherDeduction: 0, netSalary: 10650, accountNumber: '42827032486', bankName: 'STATE BANK OF INDIA', bankBranch: 'BAGALUR', ifscCode: 'SBIN0040327' },
  { id: 'emp_45', name: 'Varalakshmi', branch: 'VRSNB', department: 'HOUSE KEEPING', grossSalary: 12000, salaryAdvance: 0, canteenDeduction: 260, uniformDeduction: 0, otherDeduction: 0, netSalary: 10540, accountNumber: '975185957', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_46', name: 'Perarasu', branch: 'VRSNB', department: 'DRIVER & MAINTENANCE', grossSalary: 20000, salaryAdvance: 0, canteenDeduction: 300, uniformDeduction: 0, otherDeduction: 0, netSalary: 16367, accountNumber: '6994799450', bankName: 'INDIAN BANK', bankBranch: 'KANNANDAHALLI', ifscCode: 'IDIB000K076' },
  { id: 'emp_47', name: 'Saravanan (Driver)', branch: 'VRSNB', department: 'DRIVER & MAINTENANCE', grossSalary: 20000, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 18667, accountNumber: '6099410066', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_48', name: 'Vijendra', branch: 'VRSNB', department: 'DRIVER & MAINTENANCE', grossSalary: 19000, salaryAdvance: 0, canteenDeduction: 350, uniformDeduction: 0, otherDeduction: 0, netSalary: 14850, accountNumber: '7969159899', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_49', name: 'Anirudh', branch: 'VRSNB', department: 'COOKING & CUTTING', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 570, uniformDeduction: 0, otherDeduction: 22, netSalary: 13008, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_50', name: 'Bittu Kumar', branch: 'VRSNB', department: 'COOKING & CUTTING', grossSalary: 23000, salaryAdvance: 0, canteenDeduction: 160, uniformDeduction: 845, otherDeduction: 0, netSalary: 8195, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_51', name: 'Prince Kumar', branch: 'VRSNB', department: 'COOKING & CUTTING', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 620, uniformDeduction: 0, otherDeduction: 22, netSalary: 13525, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_52', name: 'Rohith Kumar', branch: 'VRSNB', department: 'COOKING & CUTTING', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 270, uniformDeduction: 0, otherDeduction: 0, netSalary: 6530, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_53', name: 'Munna Bhatt', branch: 'VRSNB', department: 'SECURITY', grossSalary: 22000, salaryAdvance: 0, canteenDeduction: 240, uniformDeduction: 0, otherDeduction: 0, netSalary: 22493, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_54', name: 'Manna Bhatt', branch: 'VRSNB', department: 'SECURITY', grossSalary: 22000, salaryAdvance: 0, canteenDeduction: 690, uniformDeduction: 0, otherDeduction: 0, netSalary: 22043, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_55', name: 'Dharumarasan', branch: 'VRSNB', department: 'SOUTH INDIAN FOOD MASTER', grossSalary: 27000, salaryAdvance: 0, canteenDeduction: 660, uniformDeduction: 450, otherDeduction: 0, netSalary: 23190, accountNumber: '20195007060', bankName: 'STATE BANK OF INDIA', bankBranch: 'THYAGARAYA NAGAR', ifscCode: 'SBIN0001020' },
  { id: 'emp_56', name: 'Murugan S', branch: 'VRSNB', department: 'SOUTH INDIAN FOOD MASTER', grossSalary: 30000, salaryAdvance: 0, canteenDeduction: 30, uniformDeduction: 0, otherDeduction: 0, netSalary: 4970, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_57', name: 'Kamlesh', branch: 'VRSNB', department: 'CHATS MASTER', grossSalary: 30000, salaryAdvance: 0, canteenDeduction: 560, uniformDeduction: 845, otherDeduction: 0, netSalary: 29595, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_58', name: 'Lalan Kumar', branch: 'VRSNB', department: 'CHATS MASTER', grossSalary: 18000, salaryAdvance: 0, canteenDeduction: 500, uniformDeduction: 845, otherDeduction: 0, netSalary: 16055, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_59', name: 'Aman', branch: 'VRSNB', department: 'CHINESE FOOD MASTER', grossSalary: 20000, salaryAdvance: 0, canteenDeduction: 500, uniformDeduction: 845, otherDeduction: 0, netSalary: 17988, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_60', name: 'Deepak', branch: 'VRSNB', department: 'CHINESE FOOD MASTER', grossSalary: 32000, salaryAdvance: 0, canteenDeduction: 260, uniformDeduction: 0, otherDeduction: 0, netSalary: 16807, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_61', name: 'Roshan', branch: 'VRSNB', department: 'CHINESE FOOD MASTER', grossSalary: 20000, salaryAdvance: 0, canteenDeduction: 470, uniformDeduction: 845, otherDeduction: 0, netSalary: 17352, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  // Cafe Aadvikam
  { id: 'emp_62', name: 'Anil Kumar A P', branch: 'Cafe Aadvikam', department: 'KITCHEN', grossSalary: 28000, salaryAdvance: 0, canteenDeduction: 220, uniformDeduction: 0, otherDeduction: 0, netSalary: 16580, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_63', name: 'Harsha Vardhan', branch: 'Cafe Aadvikam', department: 'KITCHEN', grossSalary: 25000, salaryAdvance: 0, canteenDeduction: 30, uniformDeduction: 0, otherDeduction: 0, netSalary: 16220, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_64', name: 'Ramesh', branch: 'Cafe Aadvikam', department: 'KITCHEN', grossSalary: 40000, salaryAdvance: 0, canteenDeduction: 660, uniformDeduction: 450, otherDeduction: 0, netSalary: 34890, accountNumber: '20008965166', bankName: 'STATE BANK OF INDIA', bankBranch: 'KALAKAD', ifscCode: 'SBIN0070209' },
  { id: 'emp_65', name: 'Mahalakshmi', branch: 'Cafe Aadvikam', department: 'SALES', grossSalary: 16000, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 4267, accountNumber: '7764097037', bankName: 'INDIAN BANK', bankBranch: 'HOSUR', ifscCode: 'IDIB000H011' },
  { id: 'emp_66', name: 'Raju', branch: 'Cafe Aadvikam', department: 'SALES', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 670, uniformDeduction: 0, otherDeduction: 0, netSalary: 14630, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_67', name: 'Swetha', branch: 'Cafe Aadvikam', department: 'SALES', grossSalary: 0, salaryAdvance: 0, canteenDeduction: 230, uniformDeduction: 0, otherDeduction: 0, netSalary: -230, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_68', name: 'Vinodha', branch: 'Cafe Aadvikam', department: 'SALES', grossSalary: 12000, salaryAdvance: 0, canteenDeduction: 30, uniformDeduction: 0, otherDeduction: 0, netSalary: 9970, accountNumber: '6651746545', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_69', name: 'Anusha S', branch: 'Cafe Aadvikam', department: 'SALES', grossSalary: 0, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 0, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  // SNB
  { id: 'emp_70', name: 'Anil', branch: 'SNB', department: 'SALES', grossSalary: 19600, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 12413, accountNumber: '6110072535', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_71', name: 'Devsaran Kumar', branch: 'SNB', department: 'SALES', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 14733, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_72', name: 'Harish Kumar', branch: 'SNB', department: 'SALES', grossSalary: 17500, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 14583, accountNumber: '6098755240', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_73', name: 'Munna Kumar (SNB)', branch: 'SNB', department: 'SALES', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 6233, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_74', name: 'Pushpa', branch: 'SNB', department: 'SALES', grossSalary: 13000, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 10833, accountNumber: '609705433', bankName: 'INDIAN BANK', bankBranch: 'HOSUR', ifscCode: 'IDIB000H011' },
  { id: 'emp_75', name: 'Senthamilan', branch: 'SNB', department: 'SALES', grossSalary: 36300, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 30250, accountNumber: '6099394870', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_76', name: 'Sreenath', branch: 'SNB', department: 'SALES', grossSalary: 17000, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 8500, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_77', name: 'Vignesh', branch: 'SNB', department: 'SALES', grossSalary: 21000, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 11900, accountNumber: '7924980954', bankName: 'INDIAN BANK', bankBranch: 'BERIGAI', ifscCode: 'IDIB000B017' },
  { id: 'emp_78', name: 'Kishornath.V', branch: 'SNB', department: 'WEEKEND STAFF', grossSalary: 12000, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 1600, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
  { id: 'emp_79', name: 'Mani T S M', branch: 'SNB', department: 'WEEKEND STAFF', grossSalary: 0, salaryAdvance: 0, canteenDeduction: 0, uniformDeduction: 0, otherDeduction: 0, netSalary: 4500, accountNumber: '', bankName: '', bankBranch: '', ifscCode: '' },
];

const BRANCHES = ['All', 'VRSNB', 'Cafe Aadvikam', 'SNB'] as const;
const BRANCH_COLORS: Record<string, string> = {
  'VRSNB': 'bg-blue-100 text-blue-800 border-blue-200',
  'Cafe Aadvikam': 'bg-orange-100 text-orange-800 border-orange-200',
  'SNB': 'bg-amber-100 text-amber-700 border-amber-200',
};

const DAYS_IN_MONTH = 30; // April 2026
const today = new Date();
const CURRENT_MONTH = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const STORAGE_KEY = `attendance_${CURRENT_MONTH}`;

function loadAttendance(): MonthAttendance {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveAttendance(att: MonthAttendance) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(att));
}
function attKey(empId: string, day: number) { return `${empId}_${day}`; }

// ─── Salary Calculator ────────────────────────────────────────────────────────
function calcSalary(emp: Employee, att: MonthAttendance) {
  let presentDays = 0; let canteenTotal = 0;
  for (let d = 1; d <= DAYS_IN_MONTH; d++) {
    const k = attKey(emp.id, d);
    const a = att[k];
    if (a?.present) presentDays++;
    if (a) {
      const meals = [a.bf, a.lunch, a.dinner].filter(Boolean).length;
      canteenTotal += meals === 3 ? 30 : meals * 10;
    }
  }
  const wagePd = emp.grossSalary / DAYS_IN_MONTH;
  const earned = Math.round(wagePd * presentDays);
  const totalDed = emp.salaryAdvance + canteenTotal + emp.uniformDeduction + emp.otherDeduction;
  const net = earned - totalDed;
  return { presentDays, canteenTotal, earned, totalDed, net };
}

// ─── Attendance Cell ──────────────────────────────────────────────────────────
function AttCell({ empId, day, att, onChange }: { empId: string; day: number; att: MonthAttendance; onChange: (k: string, v: DayAttendance) => void }) {
  const k = attKey(empId, day);
  const a: DayAttendance = att[k] ?? { present: false, bf: false, lunch: false, dinner: false };
  const isSun = new Date(2026, 3, day).getDay() === 0; // April 2026

  const togglePresent = () => {
    const next = { ...a, present: !a.present };
    if (!next.present) { next.bf = false; next.lunch = false; next.dinner = false; }
    onChange(k, next);
  };
  const toggleMeal = (meal: 'bf' | 'lunch' | 'dinner') => {
    if (!a.present) return;
    onChange(k, { ...a, [meal]: !a[meal] });
  };

  return (
    <div className={cn('flex flex-col items-center gap-0.5 min-w-[40px]', isSun && 'opacity-50')}>
      <button
        onClick={togglePresent}
        className={cn('size-7 rounded-md flex items-center justify-center text-[10px] font-bold transition-all active:scale-90 border',
          a.present ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
        )}
      >
        {a.present ? '✓' : day}
      </button>
      {a.present && (
        <div className="flex gap-px">
          {(['bf', 'lunch', 'dinner'] as const).map(m => (
            <button key={m} onClick={() => toggleMeal(m)}
              className={cn('w-[11px] h-[6px] rounded-sm text-[5px] transition-all', a[m] ? 'bg-orange-400' : 'bg-muted border border-border/50')} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Employee Row (in attendance tab) ────────────────────────────────────────
function EmpAttRow({ emp, att, onChange, onSelect, selected }: { emp: Employee; att: MonthAttendance; onChange: (k: string, v: DayAttendance) => void; onSelect: () => void; selected: boolean }) {
  const { presentDays, canteenTotal, earned, net } = calcSalary(emp, att);
  return (
    <div className={cn('border-b border-border/40 py-2', selected && 'bg-primary/5')}>
      <div className="flex items-center gap-2 px-3 mb-1.5 cursor-pointer" onClick={onSelect}>
        <div className={cn('shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold border', BRANCH_COLORS[emp.branch])}>{emp.branch === 'Cafe Aadvikam' ? 'Cafe' : emp.branch}</div>
        <p className="font-body font-semibold text-xs text-foreground flex-1 truncate">{emp.name}</p>
        <span className="text-[10px] font-body text-muted-foreground shrink-0">{presentDays}d · ₹{net.toLocaleString('en-IN')}</span>
        {selected ? <ChevronUp className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />}
      </div>

      {selected && (
        <div className="px-3 pb-1">
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-1 min-w-max">
              {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map(day => (
                <AttCell key={day} empId={emp.id} day={day} att={att} onChange={onChange} />
              ))}
            </div>
          </div>
          <div className="mt-1.5 flex gap-1 text-[9px] font-body text-muted-foreground">
            <span className="inline-flex items-center gap-0.5"><span className="size-2 rounded-sm bg-orange-400 inline-block" />BF</span>
            <span className="inline-flex items-center gap-0.5"><span className="size-2 rounded-sm bg-orange-400 inline-block" />Lunch</span>
            <span className="inline-flex items-center gap-0.5"><span className="size-2 rounded-sm bg-orange-400 inline-block" />Dinner</span>
            <span className="ml-auto text-orange-600 font-semibold">Canteen: ₹{canteenTotal}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Salary Card ──────────────────────────────────────────────────────────────
function SalaryCard({ emp, att }: { emp: Employee; att: MonthAttendance }) {
  const { presentDays, canteenTotal, earned, totalDed, net } = calcSalary(emp, att);
  const leaves = DAYS_IN_MONTH - presentDays;
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold border', BRANCH_COLORS[emp.branch])}>{emp.branch === 'Cafe Aadvikam' ? 'Cafe' : emp.branch}</span>
            <span className="text-[10px] font-body text-muted-foreground">{emp.department}</span>
          </div>
          <p className="font-display font-bold text-base text-foreground">{emp.name}</p>
          {emp.accountNumber && <p className="text-[10px] font-body text-muted-foreground mt-0.5">{emp.bankName} · {emp.accountNumber}</p>}
        </div>
        <div className={cn('text-right', net < 0 && 'text-destructive')}>
          <p className="font-display font-bold text-lg tabular-nums">₹{Math.abs(net).toLocaleString('en-IN')}</p>
          <p className="text-[10px] font-body text-muted-foreground">Net Salary</p>
        </div>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <Row label="Gross Salary" value={`₹${emp.grossSalary.toLocaleString('en-IN')}`} />
        <Row label="Days Present" value={`${presentDays} / ${DAYS_IN_MONTH}`} />
        <Row label="Leaves" value={String(leaves)} />
        <Row label="Earned" value={`₹${earned.toLocaleString('en-IN')}`} highlight />
        <Row label="Salary Advance" value={emp.salaryAdvance > 0 ? `-₹${emp.salaryAdvance.toLocaleString('en-IN')}` : '—'} neg={emp.salaryAdvance > 0} />
        <Row label="Canteen Ded." value={canteenTotal > 0 ? `-₹${canteenTotal}` : '—'} neg={canteenTotal > 0} />
        <Row label="Uniform Ded." value={emp.uniformDeduction > 0 ? `-₹${emp.uniformDeduction}` : '—'} neg={emp.uniformDeduction > 0} />
        <Row label="Other Ded." value={emp.otherDeduction > 0 ? `-₹${emp.otherDeduction}` : '—'} neg={emp.otherDeduction > 0} />
        <div className="col-span-2 border-t border-border pt-1.5 mt-0.5">
          <div className="flex justify-between">
            <span className="font-body font-bold text-sm text-foreground">Net Payable</span>
            <span className={cn('font-display font-bold text-base tabular-nums', net < 0 ? 'text-destructive' : 'text-primary')}>
              ₹{net.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>
      {emp.bankBranch && (
        <div className="px-4 py-2 bg-muted/40 border-t border-border flex items-center gap-2">
          <span className="text-[9px] font-body text-muted-foreground uppercase font-semibold">IFSC</span>
          <span className="text-[10px] font-body font-semibold text-foreground">{emp.ifscCode}</span>
          <span className="text-muted-foreground mx-1">·</span>
          <span className="text-[10px] font-body text-muted-foreground">{emp.bankBranch}</span>
        </div>
      )}
    </div>
  );
}
function Row({ label, value, highlight, neg }: { label: string; value: string; highlight?: boolean; neg?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-body text-muted-foreground">{label}</span>
      <span className={cn('text-[11px] font-body font-semibold tabular-nums', highlight && 'text-primary', neg && 'text-destructive')}>{value}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AttendanceSalary() {
  const [tab, setTab] = useState<'attendance' | 'salary' | 'employees'>('attendance');
  const [branch, setBranch] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [att, setAtt] = useState<MonthAttendance>(loadAttendance);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [showBranchDD, setShowBranchDD] = useState(false);

  const updateAtt = (k: string, v: DayAttendance) => {
    setAtt(prev => { const next = { ...prev, [k]: v }; saveAttendance(next); return next; });
  };

  const filtered = useMemo(() => {
    let list = SEED_EMPLOYEES;
    if (branch !== 'All') list = list.filter(e => e.branch === branch);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(e => e.name.toLowerCase().includes(q) || e.department.toLowerCase().includes(q)); }
    return list;
  }, [branch, search]);

  // Summary stats
  const summary = useMemo(() => {
    const list = branch === 'All' ? SEED_EMPLOYEES : SEED_EMPLOYEES.filter(e => e.branch === branch);
    let totalGross = 0, totalNet = 0, totalPresent = 0;
    list.forEach(e => { const c = calcSalary(e, att); totalGross += e.grossSalary; totalNet += c.net; totalPresent += c.presentDays; });
    return { totalGross, totalNet, avgPresent: list.length ? Math.round(totalPresent / list.length) : 0, count: list.length };
  }, [branch, att]);

  return (
    <div className="min-h-screen bg-background pt-14 pb-20">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Attendance & Salary</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">April 2026 · {SEED_EMPLOYEES.length} Employees</p>
        </div>
        {/* Branch Filter */}
        <div className="relative">
          <button onClick={() => setShowBranchDD(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-body font-semibold text-foreground active:scale-95 transition-all">
            <Building2 className="size-3.5 text-muted-foreground" />
            {branch}
            <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', showBranchDD && 'rotate-180')} />
          </button>
          {showBranchDD && (
            <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-20 min-w-[140px] overflow-hidden">
              {BRANCHES.map(b => (
                <button key={b} onClick={() => { setBranch(b); setShowBranchDD(false); }}
                  className={cn('w-full px-4 py-2.5 text-left text-xs font-body font-semibold transition-colors', b === branch ? 'cafe-gradient text-primary-foreground' : 'text-foreground hover:bg-muted')}>
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="px-4 grid grid-cols-3 gap-2 mb-3">
        {[
          { icon: <Users className="size-3.5" />, label: 'Employees', value: String(summary.count), color: 'text-blue-600 bg-blue-50' },
          { icon: <IndianRupee className="size-3.5" />, label: 'Total Net', value: `₹${(summary.totalNet / 100000).toFixed(1)}L`, color: 'text-emerald-600 bg-emerald-50' },
          { icon: <Calendar className="size-3.5" />, label: 'Avg Days', value: String(summary.avgPresent), color: 'text-primary bg-primary/10' },
        ].map(({ icon, label, value, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-3">
            <div className={cn('size-7 rounded-lg flex items-center justify-center mb-1.5', color)}>{icon}</div>
            <p className="font-display text-lg font-bold tabular-nums">{value}</p>
            <p className="text-[10px] font-body text-muted-foreground uppercase font-semibold">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 mb-3">
        {[
          { key: 'attendance', label: '📅 Attendance', icon: <CheckCircle2 className="size-3.5" /> },
          { key: 'salary', label: '💰 Salary', icon: <IndianRupee className="size-3.5" /> },
          { key: 'employees', label: '👥 Employees', icon: <Users className="size-3.5" /> },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key as typeof tab)}
            className={cn('flex-1 py-2.5 rounded-xl text-xs font-body font-bold transition-all',
              tab === key ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input type="text" placeholder="Search employee or department…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      {/* ── ATTENDANCE TAB ─────────────────────────────────────────────────── */}
      {tab === 'attendance' && (
        <div className="bg-card border border-border mx-4 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-foreground">Daily Attendance</h2>
              <p className="text-[10px] font-body text-muted-foreground">Tap employee → tap days to mark. Tap meal squares for food deduction.</p>
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1">
              <span className="text-[9px] font-body font-semibold text-muted-foreground uppercase">Meal = ₹10</span>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="py-12 text-center"><p className="font-body text-muted-foreground text-sm">No employees found</p></div>
          ) : filtered.map(emp => (
            <EmpAttRow key={emp.id} emp={emp} att={att} onChange={updateAtt}
              onSelect={() => setSelectedEmpId(prev => prev === emp.id ? null : emp.id)}
              selected={selectedEmpId === emp.id} />
          ))}
        </div>
      )}

      {/* ── SALARY TAB ────────────────────────────────────────────────────── */}
      {tab === 'salary' && (
        <div className="px-4 space-y-3">
          {/* Total payable summary */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="font-display font-bold text-foreground mb-3 flex items-center gap-2">
              <TrendingDown className="size-4 text-primary" />
              {branch === 'All' ? 'All Branches' : branch} — Salary Summary
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-body"><span className="text-muted-foreground">Total Gross</span><span className="font-bold tabular-nums">₹{summary.totalGross.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-sm font-body text-primary"><span>Total Net Payable</span><span className="font-bold tabular-nums">₹{summary.totalNet.toLocaleString('en-IN')}</span></div>
            </div>
          </div>
          {filtered.map(emp => <SalaryCard key={emp.id} emp={emp} att={att} />)}
        </div>
      )}

      {/* ── EMPLOYEES TAB ─────────────────────────────────────────────────── */}
      {tab === 'employees' && (
        <div className="px-4 space-y-2">
          {filtered.map(emp => (
            <div key={emp.id} className="bg-card border border-border rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold border shrink-0', BRANCH_COLORS[emp.branch])}>{emp.branch === 'Cafe Aadvikam' ? 'Cafe' : emp.branch}</span>
                    <span className="text-[10px] font-body text-muted-foreground truncate">{emp.department}</span>
                  </div>
                  <p className="font-body font-bold text-sm text-foreground">{emp.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display font-bold text-base tabular-nums text-foreground">₹{emp.grossSalary > 0 ? emp.grossSalary.toLocaleString('en-IN') : '—'}</p>
                  <p className="text-[10px] font-body text-muted-foreground">Gross</p>
                </div>
              </div>
              {emp.accountNumber && (
                <div className="mt-1.5 bg-muted/50 rounded-lg px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <div className="col-span-2 flex justify-between"><span className="text-[10px] font-body text-muted-foreground">Account</span><span className="text-[10px] font-body font-semibold">{emp.accountNumber}</span></div>
                  <div className="flex justify-between col-span-2"><span className="text-[10px] font-body text-muted-foreground">Bank</span><span className="text-[10px] font-body font-semibold truncate ml-2">{emp.bankName}</span></div>
                  {emp.ifscCode && <div className="flex justify-between col-span-2"><span className="text-[10px] font-body text-muted-foreground">IFSC</span><span className="text-[10px] font-body font-mono font-semibold">{emp.ifscCode}</span></div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="h-4" />
    </div>
  );
}
