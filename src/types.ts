export type UserRole = 'control' | 'regular' | 'gate';

export type QrDeliveryMode = 'on_screen' | 'contact_info';
export type ContactDeliveryChannel = 'email' | 'phone' | 'both';
export type ScanOutcome = 'VALID' | 'INVALID' | 'USED';
export type PassStatus = 'PENDING' | 'USED';

export interface FieldToggles {
  parentNumber: boolean;
  fullName: boolean;
  phone: boolean;
  email: boolean;
  numAttendees: boolean;
  school: boolean;
  attendeeAges: boolean;
  otherAttendeeContacts: boolean;
}

export interface RequiredFields {
  phone: boolean;
  email: boolean;
}

export interface EventItem {
  id: string;
  slug: string;
  name: string;
  eventDate: string;
  qrDeliveryMode: QrDeliveryMode;
  contactDeliveryChannel: ContactDeliveryChannel;
  strictGateMode: boolean;
  fieldToggles: FieldToggles;
  requiredFields: RequiredFields;
  createdAt: string;
}

export interface EventSettings {
  eventTitle: string;
  qrDeliveryMode: QrDeliveryMode;
  contactDeliveryChannel: ContactDeliveryChannel;
  strictGateMode: boolean;
  fieldToggles: FieldToggles;
  requiredFields: RequiredFields;
}

export interface Venue {
  id: string;
  eventId: string;
  slug: string;
  name: string;
  capacity: number; // Visible ONLY in Control Dashboard
  sortOrder?: number;
}

export interface AuthorizedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  addedBy: string;
  createdAt: string;
}

export interface OtherAttendeeDetail {
  name: string;
  contact: string;
}

export interface AttendeePass {
  passCode: string;
  eventId: string;
  registrationId: string;
  passIndex: number;
  totalPasses: number;
  attendeeLabel: string;
  attendeeAge: string;
  attendeeContact: string;
  status: PassStatus;
  usedAt: string | null;
  usedGate: string | null;
  scannedBy: string | null;
}

export interface Registration {
  id: string;
  eventId: string;
  parentNumber: string;
  name: string;
  phone: string;
  email: string;
  schoolType: 'sabis_isc' | 'other' | '';
  schoolBranch: string;
  schoolOther: string;
  category: 'VIP' | 'Regular Parent';
  assignedGate: string;
  partySize: number;
  attendeeAges: string[];
  otherAttendees: OtherAttendeeDetail[];
  notes: string;
  deliveryMode: QrDeliveryMode;
  deliveryStatus: 'displayed' | 'sent' | 'queued';
  registeredAt: string;
  passes: AttendeePass[];
}

export interface ScanLog {
  id: string;
  eventId: string;
  scannedAt: string;
  passCode: string;
  registrationId: string;
  parentNumber: string;
  attendeeName: string;
  tier: string;
  gate: string;
  status: ScanOutcome;
  message: string;
  firstUsedAt?: string | null;
  scannedBy: string;
}

export interface AuthSession {
  email: string;
  fullName: string;
  role: UserRole;
  isSupabaseAuth: boolean;
}
