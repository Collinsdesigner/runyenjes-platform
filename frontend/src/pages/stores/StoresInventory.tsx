import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  uom: string;
  quantityOnHand: string;
  reorderLevel: string;
}

export default function StoresInventory() {
  const { token } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [uom, setUom] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState('0');

  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveType, setMoveType] = useState('RECEIPT');
  const [moveQty, setMoveQty] = useState('');
  const [moveReason, setMoveReason] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api('/stores/items', { token });
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load inventory');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!name) {
      setError('Item name is required');
      return;
    }
    try {
      await api('/stores/items', {
        method: 'POST',
        token,
        body: { name, category: category || undefined, uom, reorderLevel: Number(reorderLevel) || 0 },
      });
      setMessage('Item created');
      setName('');
      setCategory('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create item');
    }
  }

  async function handleMovement(itemId: string) {
    setError('');
    setMessage('');
    if (!moveQty) {
      setError('Quantity is required');
      return;
    }
    try {
      await api(`/stores/items/${itemId}/movements`, {
        method: 'POST',
        token,
        body: { type: moveType, quantity: Number(moveQty), reason: moveReason || undefined },
      });
      setMessage('Movement recorded');
      setMovingId(null);
      setMoveQty('');
      setMoveReason('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record movement');
    }
  }

  return (
    <PortalLayout title="Inventory">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Inventory</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Stock items and movement history.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-300">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm dark:bg-green-950 dark:border-green-800 dark:text-green-300">{message}</div>
        )}

        <form onSubmit={handleCreateItem} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3 dark:bg-gray-900 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">New Item</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
              placeholder="Item name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
              placeholder="Category (optional)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
              placeholder="Unit (pcs, kg, litres...)"
              value={uom}
              onChange={(e) => setUom(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm dark:border-gray-600"
              placeholder="Reorder level"
              type="number"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create Item
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden dark:bg-gray-900 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left dark:bg-gray-950 dark:text-gray-400">
              <tr>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">On hand</th>
                <th className="px-4 py-2">Reorder level</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">Loading...</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">No items yet</td></tr>
              )}
              {items.map((item) => (
                <>
                  <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-2">{item.name}</td>
                    <td className="px-4 py-2">{item.category || '—'}</td>
                    <td className="px-4 py-2">
                      {item.quantityOnHand} {item.uom}
                    </td>
                    <td className="px-4 py-2">{item.reorderLevel}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        className="text-rgreen text-xs font-medium"
                        onClick={() => setMovingId(movingId === item.id ? null : item.id)}
                      >
                        {movingId === item.id ? 'Cancel' : 'Record movement'}
                      </button>
                    </td>
                  </tr>
                  {movingId === item.id && (
                    <tr className="bg-gray-50 dark:bg-gray-950">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 items-center">
                          <select
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm dark:border-gray-600"
                            value={moveType}
                            onChange={(e) => setMoveType(e.target.value)}
                          >
                            <option value="RECEIPT">Receipt (stock in)</option>
                            <option value="ISSUE">Issue (stock out)</option>
                            <option value="ADJUSTMENT">Adjustment</option>
                          </select>
                          <input
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-24 dark:border-gray-600"
                            placeholder="Quantity"
                            type="number"
                            value={moveQty}
                            onChange={(e) => setMoveQty(e.target.value)}
                          />
                          <input
                            className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-48 dark:border-gray-600"
                            placeholder="Reason (optional)"
                            value={moveReason}
                            onChange={(e) => setMoveReason(e.target.value)}
                          />
                          <button
                            className="bg-rgreen text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                            onClick={() => handleMovement(item.id)}
                          >
                            Save Movement
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PortalLayout>
  );
}
