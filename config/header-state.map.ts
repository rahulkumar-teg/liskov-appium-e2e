// Android manual-download row text → HeaderState (plan §4.6). Order matters: longer/more specific prefixes first.
// Contract-tested against android strings.xml and WeeklyEditionCovers.kt (tests/contract/header-state.contract.spec.ts).
import type { HeaderState } from '../src/model/HeaderState.js';

export interface HeaderMapEntry {
  state: HeaderState;
  /** strings.xml resource whose value this text must be a prefix of. */
  resource: string;
  text: string;
  /** Action label rendered after two spaces (labelWithAction), resource name; null = no action. */
  actionResource: string | null;
  action: string | null;
  match: 'prefix' | 'exact';
}

export const androidHeaderMap: readonly HeaderMapEntry[] = [
  { state: 'BOTH_DONE', resource: 'weekly_edition_downloaded', text: 'Edition downloaded', actionResource: 'weekly_delete_edition_downloaded', action: 'Delete', match: 'prefix' },
  { state: 'PRINT_DONE', resource: 'weekly_pdf_downloaded', text: 'Print edition downloaded', actionResource: 'for_you_downloads_manage', action: 'Manage', match: 'prefix' },
  { state: 'AA_DONE', resource: 'weekly_articles_audio_downloaded', text: 'Articles & audio downloaded', actionResource: 'for_you_downloads_manage', action: 'Manage', match: 'prefix' },
  { state: 'DOWNLOADING_PRINT', resource: 'weekly_downloading_pdf', text: 'Downloading print edition', actionResource: null, action: null, match: 'prefix' },
  { state: 'DOWNLOADING_AA', resource: 'weekly_downloading_articles_audio', text: 'Downloading articles & audio', actionResource: null, action: null, match: 'prefix' },
  { state: 'WAITING_WIFI', resource: 'weekly_download_waiting_for_wifi', text: 'Waiting for Wi-Fi', actionResource: 'weekly_cancel_edition_download', action: null, match: 'prefix' },
  { state: 'FAILED', resource: 'weekly_edition_download_failed', text: 'Failed download', actionResource: 'weekly_retry_edition_download', action: null, match: 'prefix' },
  { state: 'NOTHING', resource: 'weekly_download_edition', text: 'Download', actionResource: null, action: null, match: 'exact' },
];
