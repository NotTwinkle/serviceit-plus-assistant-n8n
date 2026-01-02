/**
 * Type definitions for Ivanti-specific global objects
 * These are injected by Ivanti Service Manager / Neurons into the browser window
 */

interface IvantiSession {
  RecId?: string;
  recId?: string;
  LoginId?: string;
  loginId?: string;
  UserName?: string;
  username?: string;
  Email?: string;
  email?: string;
  PrimaryEmail?: string;
  primaryEmail?: string;
  DisplayName?: string;
  displayName?: string;
  FullName?: string;
  fullName?: string;
  CurrentRole?: string;
  currentRole?: string;
  ActiveRole?: string;
  activeRole?: string;
  Role?: string;
  role?: string;
  Roles?: string[] | any[];
  roles?: string[] | any[];
  UserId?: string;
  userId?: string;
  EmployeeRecId?: string;
  IsSuperAdmin?: boolean;
  AppName?: string;
}

interface IvantiCurrentUser {
  RecId?: string;
  recId?: string;
  LoginId?: string;
  loginId?: string;
  UserName?: string;
  username?: string;
  Email?: string;
  email?: string;
  PrimaryEmail?: string;
  primaryEmail?: string;
  DisplayName?: string;
  displayName?: string;
  FullName?: string;
  fullName?: string;
  FirstName?: string;
  firstName?: string;
  LastName?: string;
  lastName?: string;
  Team?: string;
  team?: string;
  Department?: string;
  department?: string;
  OrganizationalUnit?: string;
  organizationalUnit?: string;
  Role?: string;
  role?: string;
  EmployeeId?: string;
  employeeId?: string;
  UserId?: string;
  userId?: string;
}

interface IvantiHEAT {
  Session?: {
    CurrentUser?: IvantiCurrentUser;
    [key: string]: any;
  };
  [key: string]: any;
}

declare global {
  interface Window {
    Session?: IvantiSession;
    HEAT?: IvantiHEAT;
  }
}

export {};

