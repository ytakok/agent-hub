import type { SourceBlock } from '@agency-hub/shared';
import type { WidgetState } from '../../../shared/ui/widget-card';

/** Maps an API source block + loading flag to the card state. */
export function blockState<T>(
  block: SourceBlock<T> | undefined,
  loading: boolean,
  isEmpty: (data: T) => boolean = () => false,
): WidgetState {
  if (!block) return loading ? 'loading' : 'error';
  if (block.status === 'error') return 'error';
  if (block.status === 'disabled') return 'empty';
  return isEmpty(block.data) ? 'empty' : 'ready';
}

export function dataOf<T>(block: SourceBlock<T> | undefined): T | null {
  return block?.status === 'ok' ? block.data : null;
}
