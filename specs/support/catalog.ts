// EP-01…EP-34 catalog (plan §6.1). `needs` lists every precondition the framework must be able to satisfy WITHOUT
// changing the device in a forbidden way; a spec whose need cannot be met SKIPs with that reason (never a pass).
export type Need =
  | 'login' // signed-in entitled account (read-only whoAmI check; never logs in)
  | 'logout' // logged-out state (LoginFlow) — forbidden on personal / shared devices
  | 'flagOff' // epaper_pdf_download_enabled=false declared in flags.override.json
  | 'offline' // real path change (Airplane Mode / setConnectivity)
  | 'throttle' // NLC / emulator network speed
  | 'cellular' // SIM-only network
  | 'ipad'
  | 'tablet'
  | 'manual' // assisted capture, human verdict
  | 'multiRegion' // ≥2 REGIONS with locale change per launch
  | 'locale' // device locale change
  | 'heavy' // many PDF downloads (serial account, nightly)
  | 'contractPdf' // real staging PDF read by the contract layer (needs a stage contentId)
  | 'excludedEdition' // an existing excluded-date edition
  | 'preMinDateEdition'; // an edition before epaper_pdf_download_min_date in Browse editions

export interface EpCase {
  id: string;
  prio: 'P0' | 'P1';
  platforms: 'Both' | 'iOS' | 'Android';
  title: string;
  tags: string;
  needs: Need[];
}

export const CATALOG: Record<string, EpCase> = Object.fromEntries(
  (
    [
      ['EP-01', 'P0', 'Both', 'Download menu offers Articles & audio + Print edition', '@p0 @menu', ['login']],
      ['EP-02', 'P0', 'Both', 'Download Articles & audio to completion', '@p0 @download', ['login']],
      ['EP-03', 'P0', 'Both', 'Download Print edition to completion', '@p0 @download', ['login']],
      ['EP-04', 'P0', 'Both', 'Both formats → Edition downloaded + Delete (no Manage)', '@p0 @download', ['login']],
      ['EP-05', 'P0', 'Both', 'Delete both formats (cancel once, then confirm)', '@p0 @delete', ['login']],
      ['EP-06', 'P0', 'Both', 'E2E journey: A&A coexistence, relaunch, offline View print edition', '@p0 @e2e @offline', ['login', 'offline']],
      ['EP-07', 'P0', 'Both', 'Legacy A&A download when PDF flag OFF', '@p0 @flagoff', ['login', 'flagOff']],
      ['EP-08', 'P0', 'Both', 'Logged-out user prompted (paywall) on download/view', '@p0 @loggedout', ['logout']],
      ['EP-09', 'P0', 'Both', 'PDF controls only for editions ≥ min date', '@p0 @eligibility', ['login', 'preMinDateEdition']],
      ['EP-10', 'P0', 'iOS', 'Print controls on iPad (entitled)', '@p0 @ipad', ['login', 'ipad']],
      ['EP-11', 'P0', 'Both', 'Read PDF with zoom & pan', '@p0 @viewer', ['login']],
      ['EP-12', 'P0', 'Both', 'ePaper controls shown when flag ON', '@p0 @smoke', ['login']],
      ['EP-13', 'P0', 'Both', 'View offline without PDF → no-internet alert', '@p0 @offline', ['login', 'offline']],
      ['EP-14', 'P0', 'Both', 'View print edition online downloads inline; shared state', '@p0 @viewer', ['login']],
      ['EP-15', 'P0', 'Both', 'View offline from local storage', '@p0 @offline', ['login', 'offline']],
      ['EP-16', 'P1', 'Both', 'Cancel in-progress download', '@p1 @cancel', ['login']],
      ['EP-17', 'P1', 'Both', 'Concurrent PDF limit & queue (≥3)', '@p1 @serial-account @slow', ['login', 'throttle', 'heavy']],
      ['EP-18', 'P1', 'Both', 'Dismiss viewer during inline download keeps downloading', '@p1 @viewer', ['login']],
      ['EP-19', 'P1', 'Both', 'Regional PDFs (AP/EU/NA) valid & separate', '@p1 @region', ['login', 'multiRegion', 'locale', 'contractPdf']],
      ['EP-20', 'P1', 'Both', 'Last-read page restores per edition', '@p1 @viewer', ['login']],
      ['EP-21', 'P1', 'Both', 'Manage deletes A&A after confirm', '@p1 @delete', ['login']],
      ['EP-22', 'P1', 'Both', 'Manage deletes Print after confirm', '@p1 @delete', ['login']],
      ['EP-23', 'P1', 'Both', 'Orientation keeps current page', '@p1 @viewer @rotate', ['login']],
      ['EP-24', 'P1', 'Both', 'Excluded-date edition hides PDF controls', '@p1 @eligibility', ['login', 'excludedEdition']],
      ['EP-25', 'P1', 'Both', 'PDF limit evicts oldest (>limit)', '@p1 @serial-account @slow', ['login', 'heavy']],
      ['EP-26', 'P1', 'Both', 'Download persists across background/tab/relaunch', '@p1 @lifecycle', ['login']],
      ['EP-27', 'P1', 'Both', 'PDF internal links open & return', '@p1 @viewer', ['login', 'contractPdf']],
      ['EP-28', 'P1', 'Both', 'Page indicator & navigation accurate', '@p1 @viewer', ['login']],
      ['EP-29', 'P1', 'Android', 'Tablet sharpness (untitled in sheet)', '@p1 @manual @tablet', ['login', 'tablet', 'manual']],
      ['EP-30', 'P1', 'Both', 'Regional editions load correct PDF', '@p1 @region', ['login', 'multiRegion', 'locale', 'contractPdf']],
      ['EP-31', 'P1', 'Both', 'Retry failed A&A after reconnect (retry once)', '@p1 @offline @retry', ['login', 'throttle', 'offline']],
      ['EP-32', 'P1', 'Both', 'Retry failed Print download (retry once)', '@p1 @offline @retry', ['login', 'throttle', 'offline']],
      ['EP-33', 'P1', 'Both', 'Waiting for Wi-Fi on cellular (+cancel)', '@p1 @cellular', ['login', 'cellular']],
      ['EP-34', 'P1', 'Both', 'Zoom text quality', '@p1 @manual', ['login', 'manual']],
    ] as const
  ).map(([id, prio, platforms, title, tags, needs]) => [id, { id, prio, platforms, title, tags, needs: [...needs] }]),
);
