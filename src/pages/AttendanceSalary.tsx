import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Users, Building2, Search, ChevronDown, ChevronUp,
  IndianRupee, Calendar, TrendingDown, Plus, Trash2,
  Download, UserPlus, X, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
type Branch = 'VRSNB' | 'Cafe Aadvikam' | 'SNB';

interface Employee {
  id: string;
  name: string;
  branch: Branch;
  department: string;
  grossSalary: number;
  salaryAdvance: number;
  uniformDeduction: number;
  otherDeduction: number;
  accountNumber?: string;
  bankName?: string;
  ifscCode?: string;
}

interface DayAttendance {
  present: boolean;
  woff: boolean;
  bf: boolean;
  lunch: boolean;
  dinner: boolean;
}

type MonthAttendance = Record<string, DayAttendance>;

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS_IN_MONTH = 30;
const MONTH_LABEL = 'April 2026';
const YEAR = 2026;
const MONTH_IDX = 3; // April = index 3
const SUNDAYS = Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1)
  .filter(d => new Date(YEAR, MONTH_IDX, d).getDay() === 0);

const BRANCHES: Branch[] = ['VRSNB', 'Cafe Aadvikam', 'SNB'];
const BRANCH_COLORS: Record<Branch, string> = {
  VRSNB: 'bg-blue-100 text-blue-800 border-blue-200',
  'Cafe Aadvikam': 'bg-orange-100 text-orange-800 border-orange-200',
  SNB: 'bg-amber-100 text-amber-700 border-amber-200',
};
const BRANCH_SHORT: Record<Branch, string> = {
  VRSNB: 'VRSNB',
  'Cafe Aadvikam': 'Cafe',
  SNB: 'SNB',
};

const EMP_STORAGE_KEY = 'cafe_employees_v3';
const ATT_STORAGE_KEY = 'cafe_attendance_april2026';

// ─── Seed data from Excel ─────────────────────────────────────────────────────
const SEED: Employee[] = [
  { id: 'e1', name: 'Harshawardini S', branch: 'VRSNB', department: 'Admin Office', grossSalary: 18000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '41938132346', bankName: 'STATE BANK OF INDIA', ifscCode: 'SBIN0012245' },
  { id: 'e2', name: 'Muniratnam M', branch: 'VRSNB', department: 'Admin Office', grossSalary: 60000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '32070316447', bankName: 'STATE BANK OF INDIA', ifscCode: 'SBIN0008114' },
  { id: 'e3', name: 'Rajesh M', branch: 'VRSNB', department: 'Admin Office', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e4', name: 'Shilpa K', branch: 'VRSNB', department: 'Admin Office', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '6391131749', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e5', name: 'Sivaranjani R', branch: 'VRSNB', department: 'Admin Office', grossSalary: 25000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '44573403374', bankName: 'STATE BANK OF INDIA', ifscCode: 'SBIN0000962' },
  { id: 'e6', name: 'Yasodharan A', branch: 'VRSNB', department: 'Admin Office', grossSalary: 29000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '50100220445050', bankName: 'HDFC BANK', ifscCode: 'HDFC0001278' },
  { id: 'e7', name: 'Sekar S', branch: 'VRSNB', department: 'Admin Office', grossSalary: 0, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e8', name: 'Nithin R', branch: 'VRSNB', department: 'Admin Office', grossSalary: 28000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e9', name: 'Gowrishankar', branch: 'VRSNB', department: 'Store', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e10', name: 'Meracline', branch: 'VRSNB', department: 'Store', grossSalary: 15000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '6459259743', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e11', name: 'Padma', branch: 'VRSNB', department: 'Store', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '6310475833', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e12', name: 'Sathrohan', branch: 'VRSNB', department: 'Store', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e13', name: 'Suresh Kumar R', branch: 'VRSNB', department: 'Store', grossSalary: 30000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '7162192844', bankName: 'INDIAN BANK', ifscCode: 'IDIB000S058' },
  { id: 'e14', name: 'Amit', branch: 'VRSNB', department: 'Packing', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e15', name: 'Hussain', branch: 'VRSNB', department: 'Packing', grossSalary: 23000, salaryAdvance: 5000, uniformDeduction: 450, otherDeduction: 0, accountNumber: '1405155000060588', bankName: 'KARUR VYSYA BANK', ifscCode: 'KVBL0001405' },
  { id: 'e16', name: 'Kalavathi', branch: 'VRSNB', department: 'Packing', grossSalary: 10000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '10231296647', bankName: 'TAMILNADU GRAMA BANK', ifscCode: 'IDIB0PLB001' },
  { id: 'e17', name: 'Kalavathi V', branch: 'VRSNB', department: 'Packing', grossSalary: 10000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '888952120', bankName: 'INDIAN BANK', ifscCode: 'IDIB000S023' },
  { id: 'e18', name: 'Lal Babu', branch: 'VRSNB', department: 'Packing', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e19', name: 'Monish', branch: 'VRSNB', department: 'Packing', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e20', name: 'Roopakala', branch: 'VRSNB', department: 'Packing', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '850917530', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e21', name: 'Sudha', branch: 'VRSNB', department: 'Packing', grossSalary: 10000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e22', name: 'Anand Kumar', branch: 'VRSNB', department: 'Bakery', grossSalary: 15000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e23', name: 'Annamalai', branch: 'VRSNB', department: 'Bakery', grossSalary: 27000, salaryAdvance: 5000, uniformDeduction: 845, otherDeduction: 0, accountNumber: '6127372019', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e24', name: 'Bharath', branch: 'VRSNB', department: 'Bakery', grossSalary: 17000, salaryAdvance: 2000, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e25', name: 'Birju Kumar', branch: 'VRSNB', department: 'Bakery', grossSalary: 16000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e26', name: 'Manjunath', branch: 'VRSNB', department: 'Bakery', grossSalary: 38000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0, accountNumber: '6505441406', bankName: 'INDIAN BANK', ifscCode: 'IDIB000S023' },
  { id: 'e27', name: 'Rahul Roy', branch: 'VRSNB', department: 'Bakery', grossSalary: 15000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e28', name: 'Santhosh', branch: 'VRSNB', department: 'Bakery', grossSalary: 18000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0 },
  { id: 'e29', name: 'Saravanan', branch: 'VRSNB', department: 'Bakery', grossSalary: 24000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0, accountNumber: '6099410066', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e30', name: 'Uppendea Kumar', branch: 'VRSNB', department: 'Bakery', grossSalary: 15000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e31', name: 'Vijay', branch: 'VRSNB', department: 'Bakery', grossSalary: 27000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0, accountNumber: '6332515283', bankName: 'INDIAN BANK', ifscCode: 'IDIB000K052' },
  { id: 'e32', name: 'Seshadri', branch: 'VRSNB', department: 'Bakery', grossSalary: 0, salaryAdvance: 0, uniformDeduction: 450, otherDeduction: 0 },
  { id: 'e33', name: 'Jothi R', branch: 'VRSNB', department: 'Cake', grossSalary: 42000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0, accountNumber: '110295875910', bankName: 'CANARA BANK', ifscCode: 'CNRB0004385' },
  { id: 'e34', name: 'Ravindra', branch: 'VRSNB', department: 'Cake', grossSalary: 15000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e35', name: 'Bharath Kumar', branch: 'VRSNB', department: 'Sweets', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e36', name: 'Kannan', branch: 'VRSNB', department: 'Sweets', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '7478743974', bankName: 'INDIAN BANK', ifscCode: 'IDIB000R020' },
  { id: 'e37', name: 'Lokesh', branch: 'VRSNB', department: 'Sweets', grossSalary: 36000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0, accountNumber: '461701500376', bankName: 'ICICI BANK', ifscCode: 'ICIC0004617' },
  { id: 'e38', name: 'Shiva Kumar V', branch: 'VRSNB', department: 'Sweets', grossSalary: 33000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0, accountNumber: '6929867250', bankName: 'INDIAN BANK', ifscCode: 'IDIB000N174' },
  { id: 'e39', name: 'Alakesen', branch: 'VRSNB', department: 'Savouries', grossSalary: 33000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e40', name: 'Hemanth', branch: 'VRSNB', department: 'Savouries', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e41', name: 'Mantosh', branch: 'VRSNB', department: 'Savouries', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e42', name: 'Murali', branch: 'VRSNB', department: 'Savouries', grossSalary: 28000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '923010022700394', bankName: 'AXIS BANK', ifscCode: 'UTIB0000090' },
  { id: 'e43', name: 'Shiva Kumar M', branch: 'VRSNB', department: 'Savouries', grossSalary: 24000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e44', name: 'Silambarasan', branch: 'VRSNB', department: 'Savouries', grossSalary: 28000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '50100501047237', bankName: 'HDFC BANK', ifscCode: 'HDFC0001588' },
  { id: 'e45', name: 'Krishan', branch: 'VRSNB', department: 'Savouries', grossSalary: 20000, salaryAdvance: 0, uniformDeduction: 450, otherDeduction: 0 },
  { id: 'e46', name: 'Kargamma', branch: 'VRSNB', department: 'House Keeping', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '820303706', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e47', name: 'Lalitha', branch: 'VRSNB', department: 'House Keeping', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e48', name: 'Padmanjali', branch: 'VRSNB', department: 'House Keeping', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e49', name: 'Rajamma', branch: 'VRSNB', department: 'House Keeping', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e50', name: 'Ramadevi', branch: 'VRSNB', department: 'House Keeping', grossSalary: 13000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '886283910', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e51', name: 'Sathyamma', branch: 'VRSNB', department: 'House Keeping', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e52', name: 'Sindhu', branch: 'VRSNB', department: 'House Keeping', grossSalary: 15000, salaryAdvance: 3000, uniformDeduction: 0, otherDeduction: 0, accountNumber: '42827032486', bankName: 'STATE BANK OF INDIA', ifscCode: 'SBIN0040327' },
  { id: 'e53', name: 'Varalakshmi', branch: 'VRSNB', department: 'House Keeping', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '975185957', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e54', name: 'Muniratni', branch: 'VRSNB', department: 'House Keeping', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e55', name: 'Perarasu', branch: 'VRSNB', department: 'Driver & Maintenance', grossSalary: 20000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '6994799450', bankName: 'INDIAN BANK', ifscCode: 'IDIB000K076' },
  { id: 'e56', name: 'Saravanan (Driver)', branch: 'VRSNB', department: 'Driver & Maintenance', grossSalary: 20000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e57', name: 'Vijendra', branch: 'VRSNB', department: 'Driver & Maintenance', grossSalary: 19000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '7969159899', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e58', name: 'Moorthy', branch: 'VRSNB', department: 'Driver & Maintenance', grossSalary: 18000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e59', name: 'Anirudh', branch: 'VRSNB', department: 'Cooking & Cutting', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e60', name: 'Bittu Kumar', branch: 'VRSNB', department: 'Cooking & Cutting', grossSalary: 23000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0 },
  { id: 'e61', name: 'Prince Kumar', branch: 'VRSNB', department: 'Cooking & Cutting', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e62', name: 'Rohith Kumar', branch: 'VRSNB', department: 'Cooking & Cutting', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e63', name: 'Munna Bhatt', branch: 'VRSNB', department: 'Security', grossSalary: 22000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e64', name: 'Manna Bhatt', branch: 'VRSNB', department: 'Security', grossSalary: 22000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e65', name: 'Dharumarasan', branch: 'VRSNB', department: 'South Indian Food Master', grossSalary: 27000, salaryAdvance: 0, uniformDeduction: 450, otherDeduction: 0, accountNumber: '20195007060', bankName: 'STATE BANK OF INDIA', ifscCode: 'SBIN0001020' },
  { id: 'e66', name: 'Murugan S', branch: 'VRSNB', department: 'South Indian Food Master', grossSalary: 30000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e67', name: 'Kamlesh', branch: 'VRSNB', department: 'Chats Master', grossSalary: 30000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0 },
  { id: 'e68', name: 'Lalan Kumar', branch: 'VRSNB', department: 'Chats Master', grossSalary: 18000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0 },
  { id: 'e69', name: 'Aman', branch: 'VRSNB', department: 'Chinese Food Master', grossSalary: 20000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0 },
  { id: 'e70', name: 'Deepak', branch: 'VRSNB', department: 'Chinese Food Master', grossSalary: 32000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e71', name: 'Roshan', branch: 'VRSNB', department: 'Chinese Food Master', grossSalary: 20000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0 },
  // Cafe Aadvikam
  { id: 'e72', name: 'Anil Kumar A P', branch: 'Cafe Aadvikam', department: 'Kitchen', grossSalary: 28000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e73', name: 'Harsha Vardhan', branch: 'Cafe Aadvikam', department: 'Kitchen', grossSalary: 25000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e74', name: 'Ramesh', branch: 'Cafe Aadvikam', department: 'Kitchen', grossSalary: 40000, salaryAdvance: 0, uniformDeduction: 450, otherDeduction: 0, accountNumber: '20008965166', bankName: 'STATE BANK OF INDIA', ifscCode: 'SBIN0070209' },
  { id: 'e75', name: 'Mahalakshmi', branch: 'Cafe Aadvikam', department: 'Sales', grossSalary: 16000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '7764097037', bankName: 'INDIAN BANK', ifscCode: 'IDIB000H011' },
  { id: 'e76', name: 'Raju', branch: 'Cafe Aadvikam', department: 'Sales', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e77', name: 'Swetha', branch: 'Cafe Aadvikam', department: 'Sales', grossSalary: 15000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e78', name: 'Vinodha', branch: 'Cafe Aadvikam', department: 'Sales', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '6651746545', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e79', name: 'Anusha S', branch: 'Cafe Aadvikam', department: 'Sales', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e80', name: 'Ganesh', branch: 'Cafe Aadvikam', department: 'Chinese Food Master', grossSalary: 20000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0 },
  { id: 'e81', name: 'Sachin', branch: 'Cafe Aadvikam', department: 'Chinese Food Master', grossSalary: 18000, salaryAdvance: 0, uniformDeduction: 845, otherDeduction: 0 },
  { id: 'e82', name: 'Sachin Kumar J', branch: 'Cafe Aadvikam', department: 'Chats Master', grossSalary: 15000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e83', name: 'Vikram S', branch: 'Cafe Aadvikam', department: 'South Indian Food Master', grossSalary: 18000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e84', name: 'Dhanabaalan', branch: 'Cafe Aadvikam', department: 'South Indian Food Master', grossSalary: 18000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e85', name: 'Rajveer Singh', branch: 'Cafe Aadvikam', department: 'South Indian Food Master', grossSalary: 18000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  // SNB
  { id: 'e86', name: 'Anil (SNB)', branch: 'SNB', department: 'Sales', grossSalary: 19600, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '6110072535', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e87', name: 'Devsaran Kumar', branch: 'SNB', department: 'Sales', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e88', name: 'Harish Kumar', branch: 'SNB', department: 'Sales', grossSalary: 17500, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '6098755240', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e89', name: 'Munna Kumar (SNB)', branch: 'SNB', department: 'Sales', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e90', name: 'Pushpa', branch: 'SNB', department: 'Sales', grossSalary: 13000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '609705433', bankName: 'INDIAN BANK', ifscCode: 'IDIB000H011' },
  { id: 'e91', name: 'Senthamilan', branch: 'SNB', department: 'Sales', grossSalary: 36300, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '6099394870', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e92', name: 'Sreenath', branch: 'SNB', department: 'Sales', grossSalary: 17000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
  { id: 'e93', name: 'Vignesh', branch: 'SNB', department: 'Sales', grossSalary: 21000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0, accountNumber: '7924980954', bankName: 'INDIAN BANK', ifscCode: 'IDIB000B017' },
  { id: 'e94', name: 'Kishornath V', branch: 'SNB', department: 'Weekend Staff', grossSalary: 12000, salaryAdvance: 0, uniformDeduction: 0, otherDeduction: 0 },
];

// ─── Storage ──────────────────────────────────────────────────────────────────
function loadEmployees(): Employee[] {
  try { const r = localStorage.getItem(EMP_STORAGE_KEY); return r ? JSON.parse(r) : SEED; } catch { return SEED; }
}
function saveEmployees(e: Employee[]) { localStorage.setItem(EMP_STORAGE_KEY, JSON.stringify(e)); }
function loadAtt(): MonthAttendance {
  try { return JSON.parse(localStorage.getItem(ATT_STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveAtt(a: MonthAttendance) { localStorage.setItem(ATT_STORAGE_KEY, JSON.stringify(a)); }
const ak = (eid: string, d: number) => `${eid}_${d}`;
const defaultDay = (): DayAttendance => ({ present: false, woff: false, bf: false, lunch: false, dinner: false });

// ─── Salary Calc ──────────────────────────────────────────────────────────────
function calcSalary(emp: Employee, att: MonthAttendance) {
  let presentDays = 0, woffDays = 0, canteenTotal = 0;
  for (let d = 1; d <= DAYS_IN_MONTH; d++) {
    const a = att[ak(emp.id, d)];
    if (!a) continue;
    if (a.present) presentDays++;
    if (a.woff) woffDays++;
    if (a.present) {
      const m = [a.bf, a.lunch, a.dinner].filter(Boolean).length;
      canteenTotal += m === 3 ? 30 : m * 10;
    }
  }
  const worked = presentDays + woffDays;
  const wagePd = emp.grossSalary > 0 ? emp.grossSalary / DAYS_IN_MONTH : 0;
  const earned = Math.round(wagePd * worked);
  const totalDed = emp.salaryAdvance + canteenTotal + emp.uniformDeduction + emp.otherDeduction;
  return { presentDays, woffDays, worked, canteenTotal, earned, totalDed, net: earned - totalDed };
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase mb-1">{label}</p>
      {children}
    </div>
  );
}

function InputCls(extra = '') {
  return `w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 ${extra}`;
}

function AddEmpModal({ onAdd, onClose }: { onAdd: (e: Employee) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [branch, setBranch] = useState<Branch>('VRSNB');
  const [dept, setDept] = useState('');
  const [salary, setSalary] = useState('');
  const [advance, setAdvance] = useState('');
  const [uniform, setUniform] = useState('');
  const [other, setOther] = useState('');
  const [bank, setBank] = useState('');
  const [acc, setAcc] = useState('');
  const [ifsc, setIfsc] = useState('');
  const valid = name.trim() && dept.trim();

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-display font-bold text-lg">Add Employee</h3>
          <button onClick={onClose} className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Field label="Full Name *"><input className={InputCls()} placeholder="Employee name" value={name} onChange={e => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch *">
              <select className={InputCls()} value={branch} onChange={e => setBranch(e.target.value as Branch)}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Department *"><input className={InputCls()} placeholder="e.g. Bakery" value={dept} onChange={e => setDept(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gross Salary (₹)"><input type="number" className={InputCls()} placeholder="18000" value={salary} onChange={e => setSalary(e.target.value)} /></Field>
            <Field label="Salary Advance (₹)"><input type="number" className={InputCls()} placeholder="0" value={advance} onChange={e => setAdvance(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Uniform Ded. (₹)"><input type="number" className={InputCls()} placeholder="0" value={uniform} onChange={e => setUniform(e.target.value)} /></Field>
            <Field label="Other Ded. (₹)"><input type="number" className={InputCls()} placeholder="0" value={other} onChange={e => setOther(e.target.value)} /></Field>
          </div>
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">Bank Details (optional)</p>
            <Field label="Bank Name"><input className={InputCls()} placeholder="e.g. INDIAN BANK" value={bank} onChange={e => setBank(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account No."><input className={InputCls()} placeholder="Account" value={acc} onChange={e => setAcc(e.target.value)} /></Field>
              <Field label="IFSC Code"><input className={InputCls()} placeholder="IFSC" value={ifsc} onChange={e => setIfsc(e.target.value)} /></Field>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border text-sm font-body font-semibold hover:bg-muted transition-colors">Cancel</button>
          <button
            disabled={!valid}
            onClick={() => onAdd({ id: `emp_${Date.now()}`, name: name.trim(), branch, department: dept.trim(), grossSalary: parseInt(salary) || 0, salaryAdvance: parseInt(advance) || 0, uniformDeduction: parseInt(uniform) || 0, otherDeduction: parseInt(other) || 0, bankName: bank || undefined, accountNumber: acc || undefined, ifscCode: ifsc || undefined })}
            className="flex-1 h-11 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-semibold disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Plus className="size-4" /> Add
          </button>
        </div>
      </div>
    </div>
  );
}


function EditEmpModal({ emp, onSave, onClose }: { emp: Employee; onSave: (e: Employee) => void; onClose: () => void }) {
  const [name, setName] = useState(emp.name);
  const [branch, setBranch] = useState<Branch>(emp.branch);
  const [dept, setDept] = useState(emp.department);
  const [salary, setSalary] = useState(String(emp.grossSalary));
  const [advance, setAdvance] = useState(String(emp.salaryAdvance));
  const [uniform, setUniform] = useState(String(emp.uniformDeduction));
  const [other, setOther] = useState(String(emp.otherDeduction));
  const [bank, setBank] = useState(emp.bankName || '');
  const [acc, setAcc] = useState(emp.accountNumber || '');
  const [ifsc, setIfsc] = useState(emp.ifscCode || '');
  const valid = name.trim() && dept.trim();

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-display font-bold text-lg">Edit Employee</h3>
          <button onClick={onClose} className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Field label="Full Name *"><input className={InputCls()} placeholder="Employee name" value={name} onChange={e => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch *">
              <select className={InputCls()} value={branch} onChange={e => setBranch(e.target.value as Branch)}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Department *"><input className={InputCls()} placeholder="e.g. Bakery" value={dept} onChange={e => setDept(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gross Salary (Rs)"><input type="number" className={InputCls()} value={salary} onChange={e => setSalary(e.target.value)} /></Field>
            <Field label="Salary Advance (Rs)"><input type="number" className={InputCls()} value={advance} onChange={e => setAdvance(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Uniform Ded. (Rs)"><input type="number" className={InputCls()} value={uniform} onChange={e => setUniform(e.target.value)} /></Field>
            <Field label="Other Ded. (Rs)"><input type="number" className={InputCls()} value={other} onChange={e => setOther(e.target.value)} /></Field>
          </div>
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">Bank Details</p>
            <Field label="Bank Name"><input className={InputCls()} placeholder="e.g. INDIAN BANK" value={bank} onChange={e => setBank(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account No."><input className={InputCls()} placeholder="Account" value={acc} onChange={e => setAcc(e.target.value)} /></Field>
              <Field label="IFSC Code"><input className={InputCls()} placeholder="IFSC" value={ifsc} onChange={e => setIfsc(e.target.value)} /></Field>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border text-sm font-body font-semibold hover:bg-muted transition-colors">Cancel</button>
          <button
            disabled={!valid}
            onClick={() => onSave({ ...emp, name: name.trim(), branch, department: dept.trim(), grossSalary: parseInt(salary) || 0, salaryAdvance: parseInt(advance) || 0, uniformDeduction: parseInt(uniform) || 0, otherDeduction: parseInt(other) || 0, bankName: bank || undefined, accountNumber: acc || undefined, ifscCode: ifsc || undefined })}
            className="flex-1 h-11 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-semibold disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Pencil className="size-4" /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Attendance row (expandable) ──────────────────────────────────────────────
function AttRow({ emp, att, onUpdate, expanded, onToggle }: {
  emp: Employee; att: MonthAttendance;
  onUpdate: (k: string, v: DayAttendance) => void;
  expanded: boolean; onToggle: () => void;
}) {
  const { presentDays, woffDays, canteenTotal, net } = calcSalary(emp, att);

  const woffCount = useMemo(() =>
    Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1)
      .filter(d => att[ak(emp.id, d)]?.woff).length,
    [emp.id, att]
  );

  const toggleDay = (day: number) => {
    const k = ak(emp.id, day);
    const cur = att[k] ?? defaultDay();
    if (!cur.present && !cur.woff) {
      onUpdate(k, { ...cur, present: true });
    } else if (cur.present) {
      if (woffCount < 4) {
        onUpdate(k, { ...cur, present: false, woff: true, bf: false, lunch: false, dinner: false });
      } else {
        onUpdate(k, { ...cur, present: false, woff: false, bf: false, lunch: false, dinner: false });
      }
    } else {
      onUpdate(k, { ...cur, present: false, woff: false });
    }
  };

  const toggleMeal = (day: number, meal: 'bf' | 'lunch' | 'dinner') => {
    const k = ak(emp.id, day);
    const cur = att[k];
    if (!cur?.present) return;
    onUpdate(k, { ...cur, [meal]: !cur[meal] });
  };

  return (
    <div className={cn('border-b border-border/40', expanded && 'bg-primary/[0.03]')}>
      <button className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors active:bg-muted/40" onClick={onToggle}>
        <span className={cn('shrink-0 px-1.5 py-0.5 rounded text-[9px] font-body font-bold border', BRANCH_COLORS[emp.branch])}>
          {BRANCH_SHORT[emp.branch]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-body font-semibold text-foreground truncate">{emp.name}</p>
          <p className="text-[10px] font-body text-muted-foreground">{emp.department}</p>
        </div>
        <div className="text-right shrink-0 mr-1">
          <p className="text-xs font-body font-bold tabular-nums">{presentDays + woffDays}d</p>
          <p className={cn('text-[10px] font-body font-semibold tabular-nums', net < 0 ? 'text-destructive' : 'text-primary')}>
            ₹{net.toLocaleString('en-IN')}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-1 min-w-max">
              {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map(day => {
                const isSun = SUNDAYS.includes(day);
                const a = att[ak(emp.id, day)] ?? defaultDay();
                return (
                  <div key={day} className="flex flex-col items-center gap-0.5" style={{ minWidth: 32 }}>
                    <span className={cn('text-[9px] font-body font-semibold', isSun ? 'text-muted-foreground/40' : 'text-muted-foreground')}>
                      {day}
                    </span>
                    <button
                      disabled={isSun}
                      onClick={() => !isSun && toggleDay(day)}
                      className={cn(
                        'size-7 rounded-lg text-[9px] font-bold transition-all active:scale-90 border flex items-center justify-center',
                        isSun && 'bg-muted/20 border-border/20 text-muted-foreground/30 cursor-default',
                        !isSun && !a.present && !a.woff && 'bg-muted border-border text-muted-foreground/60 hover:border-primary/40',
                        a.present && 'bg-emerald-500 border-emerald-600 text-white',
                        a.woff && 'bg-sky-100 border-sky-300 text-sky-700',
                      )}
                    >
                      {isSun ? 'S' : a.present ? '✓' : a.woff ? 'W' : ''}
                    </button>
                    {/* Meal buttons */}
                    {a.present ? (
                      <div className="flex gap-[2px] mt-0.5">
                        {(['bf', 'lunch', 'dinner'] as const).map(m => (
                          <button
                            key={m}
                            onClick={e => { e.stopPropagation(); toggleMeal(day, m); }}
                            title={m === 'bf' ? 'Breakfast ₹10' : m === 'lunch' ? 'Lunch ₹10' : 'Dinner ₹10'}
                            className={cn(
                              'w-[18px] h-[16px] rounded text-[7px] font-bold transition-all active:scale-90 border leading-none flex items-center justify-center',
                              a[m]
                                ? 'bg-orange-400 border-orange-500 text-white'
                                : 'bg-muted border-border text-muted-foreground hover:border-orange-300'
                            )}
                          >
                            {m === 'bf' ? 'B' : m === 'lunch' ? 'L' : 'D'}
                          </button>
                        ))}
                      </div>
                    ) : <div className="h-[16px] mt-0.5" />}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground">
              <span className="size-2.5 rounded-sm bg-emerald-500 inline-block" /> Present
            </span>
            <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground">
              <span className="size-2.5 rounded-sm bg-sky-200 inline-block" /> W = Week Off ({woffCount}/4)
            </span>
            <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground">
              <span className="size-2.5 rounded-sm bg-orange-400 inline-block" /> BF / Lunch / Dinner ₹10
            </span>
            <span className="ml-auto text-[10px] font-body font-bold text-orange-600">🍽 ₹{canteenTotal}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Salary card ──────────────────────────────────────────────────────────────
function SalaryCard({ emp, att }: { emp: Employee; att: MonthAttendance }) {
  const { presentDays, woffDays, worked, canteenTotal, earned, net } = calcSalary(emp, att);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-body font-bold border shrink-0', BRANCH_COLORS[emp.branch])}>
              {BRANCH_SHORT[emp.branch]}
            </span>
            <span className="text-[10px] font-body text-muted-foreground truncate">{emp.department}</span>
          </div>
          <p className="font-display font-bold text-base text-foreground">{emp.name}</p>
          {emp.accountNumber && <p className="text-[10px] font-body text-muted-foreground mt-0.5 truncate">{emp.bankName} · {emp.accountNumber}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('font-display font-bold text-xl tabular-nums', net < 0 ? 'text-destructive' : 'text-primary')}>
            ₹{net.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] font-body text-muted-foreground">Net Salary</p>
        </div>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
        <SalRow label="Gross Salary" value={`₹${emp.grossSalary.toLocaleString('en-IN')}`} />
        <SalRow label="Days Present" value={String(presentDays)} />
        <SalRow label="Week Offs" value={String(woffDays)} />
        <SalRow label="Total Worked" value={`${worked} / ${DAYS_IN_MONTH}`} highlight />
        <SalRow label="Earned" value={`₹${earned.toLocaleString('en-IN')}`} highlight />
        <SalRow label="Canteen Ded." value={canteenTotal > 0 ? `-₹${canteenTotal}` : '—'} neg={canteenTotal > 0} />
        <SalRow label="Salary Advance" value={emp.salaryAdvance > 0 ? `-₹${emp.salaryAdvance.toLocaleString('en-IN')}` : '—'} neg={emp.salaryAdvance > 0} />
        <SalRow label="Uniform Ded." value={emp.uniformDeduction > 0 ? `-₹${emp.uniformDeduction}` : '—'} neg={emp.uniformDeduction > 0} />
        <SalRow label="Other Ded." value={emp.otherDeduction > 0 ? `-₹${emp.otherDeduction}` : '—'} neg={emp.otherDeduction > 0} />
        <div className="col-span-2 border-t border-border pt-2 mt-0.5 flex justify-between items-center">
          <span className="text-sm font-body font-bold text-foreground">Net Payable</span>
          <span className={cn('font-display font-bold text-lg tabular-nums', net < 0 ? 'text-destructive' : 'text-primary')}>
            ₹{net.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
      {emp.ifscCode && (
        <div className="px-4 py-2 bg-muted/40 border-t border-border flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[9px] font-body font-semibold text-muted-foreground uppercase">IFSC</span>
          <span className="text-[10px] font-mono font-semibold text-foreground">{emp.ifscCode}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-[10px] font-body text-muted-foreground">{emp.bankName}</span>
        </div>
      )}
    </div>
  );
}

function SalRow({ label, value, highlight, neg }: { label: string; value: string; highlight?: boolean; neg?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-body text-muted-foreground">{label}</span>
      <span className={cn('text-[11px] font-body font-semibold tabular-nums', highlight && 'text-primary', neg && 'text-destructive')}>{value}</span>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AttendanceSalary() {
  const [employees, setEmployees] = useState<Employee[]>(loadEmployees);
  const [att, setAtt] = useState<MonthAttendance>(loadAtt);
  const [tab, setTab] = useState<'attendance' | 'salary' | 'employees'>('attendance');
  const [branch, setBranch] = useState<'All' | Branch>('All');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showBranchDD, setShowBranchDD] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const ddRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setShowBranchDD(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const updateAtt = (k: string, v: DayAttendance) => {
    setAtt(prev => { const n = { ...prev, [k]: v }; saveAtt(n); return n; });
  };

  const addEmp = (emp: Employee) => {
    const updated = [...employees, emp];
    setEmployees(updated); saveEmployees(updated); setShowAddModal(false);
  };

  const removeEmp = (id: string) => {
    const updated = employees.filter(e => e.id !== id);
    setEmployees(updated); saveEmployees(updated);
  };

  const saveEmp = (emp: Employee) => {
    const updated = employees.map(e => e.id === emp.id ? emp : e);
    setEmployees(updated); saveEmployees(updated); setEditEmp(null);
  };

  const filtered = useMemo(() => {
    let list = employees;
    if (branch !== 'All') list = list.filter(e => e.branch === branch);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(e => e.name.toLowerCase().includes(q) || e.department.toLowerCase().includes(q)); }
    return list;
  }, [employees, branch, search]);

  const summary = useMemo(() => {
    const list = branch === 'All' ? employees : employees.filter(e => e.branch === branch);
    let gross = 0, net = 0, canteen = 0;
    list.forEach(e => { const c = calcSalary(e, att); gross += e.grossSalary; net += c.net; canteen += c.canteenTotal; });
    return { count: list.length, gross, net, canteen };
  }, [employees, branch, att]);

  const exportCSV = () => {
    const list = branch === 'All' ? employees : employees.filter(e => e.branch === branch);
    const rows = [
      ['Name', 'Branch', 'Department', 'Gross', 'Present', 'Week Off', 'Worked', 'Earned', 'Canteen', 'Advance', 'Uniform', 'Other', 'Net', 'Bank', 'Account', 'IFSC'],
      ...list.map(e => { const c = calcSalary(e, att); return [e.name, e.branch, e.department, e.grossSalary, c.presentDays, c.woffDays, c.worked, c.earned, c.canteenTotal, e.salaryAdvance, e.uniformDeduction, e.otherDeduction, c.net, e.bankName || '', e.accountNumber || '', e.ifscCode || '']; }),
    ];
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.map(r => r.join(',')).join('\n'));
    a.download = `salary_april2026.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Attendance & Salary</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">{MONTH_LABEL} · {employees.length} employees</p>
        </div>
        {/* Branch filter */}
        <div className="relative shrink-0" ref={ddRef}>
          <button onClick={() => setShowBranchDD(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-body font-semibold active:scale-95 transition-all">
            <Building2 className="size-3.5 text-muted-foreground" />
            {branch}
            <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', showBranchDD && 'rotate-180')} />
          </button>
          {showBranchDD && (
            <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-30 min-w-[160px] overflow-hidden">
              {(['All', ...BRANCHES] as const).map(b => (
                <button key={b} onClick={() => { setBranch(b); setShowBranchDD(false); }}
                  className={cn('w-full px-4 py-2.5 text-left text-sm font-body font-semibold transition-colors', b === branch ? 'cafe-gradient text-primary-foreground' : 'hover:bg-muted text-foreground')}>
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="px-4 grid grid-cols-2 gap-2 mb-3">
        {[
          { icon: <Users className="size-3.5 text-primary" />, bg: 'bg-primary/10', val: String(summary.count), label: 'Employees' },
          { icon: <IndianRupee className="size-3.5 text-emerald-600" />, bg: 'bg-emerald-50', val: `₹${(summary.net / 100000).toFixed(1)}L`, label: 'Total Net' },
          { icon: <TrendingDown className="size-3.5 text-orange-500" />, bg: 'bg-orange-50', val: `₹${summary.canteen.toLocaleString('en-IN')}`, label: 'Canteen Ded.' },
          { icon: <Calendar className="size-3.5 text-blue-600" />, bg: 'bg-blue-50', val: `₹${(summary.gross / 100000).toFixed(1)}L`, label: 'Total Gross' },
        ].map(({ icon, bg, val, label }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-3">
            <div className={cn('size-7 rounded-lg flex items-center justify-center mb-1.5', bg)}>{icon}</div>
            <p className="font-display text-xl font-bold tabular-nums">{val}</p>
            <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-4 mb-3">
        {([{ k: 'attendance', l: '📅 Attendance' }, { k: 'salary', l: '💰 Salary' }, { k: 'employees', l: '👥 Employees' }] as const).map(({ k, l }) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('flex-1 py-2.5 rounded-xl text-xs font-body font-bold transition-all active:scale-95', tab === k ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>
            {l}
          </button>
        ))}
      </div>

      {/* Search + actions */}
      <div className="px-4 mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input type="text" placeholder="Search name or department…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        {tab === 'salary' && (
          <button onClick={exportCSV} className="shrink-0 h-10 px-3 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-body font-semibold transition-colors">
            <Download className="size-4" /> CSV
          </button>
        )}
        {tab === 'employees' && (
          <button onClick={() => setShowAddModal(true)} className="shrink-0 h-10 px-3 rounded-xl cafe-gradient text-primary-foreground flex items-center gap-1 text-xs font-body font-semibold active:scale-95 transition-all">
            <UserPlus className="size-4" /> Add
          </button>
        )}
      </div>

      {/* ── ATTENDANCE ─────────────────────────────── */}
      {tab === 'attendance' && (
        <div className="mx-4 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-display font-bold text-foreground">Daily Attendance</h2>
            <p className="text-[10px] font-body text-muted-foreground mt-0.5">
              Tap row to expand → tap day: ✓ Present → W Week Off → Absent. Tap orange dots for meals (₹10 / ₹30 all 3). Max 4 week offs/month.
            </p>
          </div>
          {filtered.length === 0
            ? <p className="text-center py-10 font-body text-sm text-muted-foreground">No employees found</p>
            : filtered.map(e => (
                <AttRow key={e.id} emp={e} att={att} onUpdate={updateAtt}
                  expanded={expandedId === e.id}
                  onToggle={() => setExpandedId(prev => prev === e.id ? null : e.id)} />
              ))
          }
        </div>
      )}

      {/* ── SALARY ──────────────────────────────────── */}
      {tab === 'salary' && (
        <div className="px-4 space-y-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="font-display font-bold text-foreground mb-3 flex items-center gap-2">
              <TrendingDown className="size-4 text-primary" />
              {branch === 'All' ? 'All Branches' : branch} — Summary
            </h3>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm font-body"><span className="text-muted-foreground">Total Gross</span><span className="font-bold tabular-nums">₹{summary.gross.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-sm font-body"><span className="text-muted-foreground">Food Deductions</span><span className="font-bold tabular-nums text-orange-600">-₹{summary.canteen.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-sm font-body border-t border-border pt-1.5"><span className="font-bold text-foreground">Net Payable</span><span className="font-bold tabular-nums text-primary">₹{summary.net.toLocaleString('en-IN')}</span></div>
            </div>
          </div>
          {filtered.map(e => <SalaryCard key={e.id} emp={e} att={att} />)}
          {filtered.length === 0 && <p className="text-center py-10 font-body text-sm text-muted-foreground">No employees found</p>}
        </div>
      )}

      {/* ── EMPLOYEES ───────────────────────────────── */}
      {tab === 'employees' && (
        <div className="px-4 space-y-2">
          {filtered.map(e => (
            <div key={e.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-body font-bold border shrink-0', BRANCH_COLORS[e.branch])}>
                    {BRANCH_SHORT[e.branch]}
                  </span>
                  <span className="text-[10px] font-body text-muted-foreground truncate">{e.department}</span>
                </div>
                <p className="font-body font-bold text-sm text-foreground">{e.name}</p>
                {e.accountNumber && <p className="text-[10px] font-body text-muted-foreground mt-0.5 truncate">{e.bankName} · {e.accountNumber}</p>}
              </div>
              <div className="flex items-start gap-2 shrink-0">
                <div className="text-right">
                  <p className="font-display font-bold text-base tabular-nums">{e.grossSalary > 0 ? `₹${e.grossSalary.toLocaleString('en-IN')}` : '—'}</p>
                  <p className="text-[10px] font-body text-muted-foreground">Gross</p>
                </div>
                <button onClick={() => setEditEmp(e)} className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors mt-0.5">
                  <Pencil className="size-3.5" />
                </button>
                <button onClick={() => removeEmp(e.id)} className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors mt-0.5">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => setShowAddModal(true)} className="w-full h-12 rounded-xl border-2 border-dashed border-border text-sm font-body font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2">
            <Plus className="size-4" /> Add New Employee
          </button>
        </div>
      )}

      <div className="h-6" />
      {showAddModal && <AddEmpModal onAdd={addEmp} onClose={() => setShowAddModal(false)} />}
      {editEmp && <EditEmpModal emp={editEmp} onSave={saveEmp} onClose={() => setEditEmp(null)} />}
    </div>
  );
}
