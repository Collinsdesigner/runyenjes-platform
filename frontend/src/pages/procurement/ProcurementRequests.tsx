import { useEffect, useState } from 'react';
import PortalLayout from '../../components/portal/PortalLayout';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Item {
  id: string;
  name: string;
  uom: string;
  quantityOnHand: string;
}

interface PurchaseRequest {
  id: string;
  quantity: string;
  justification: string | null;
  status: string;
  item: { id: string; name: string; uom: string };
  requestedBy?: { id: string; name: string };
}

const MANAGE_ROLES = ['PROCUREMENT_OFFICER', 'ADMIN'];

export default function ProcurementRequests() {
  const { token, user } = useAuth();
  const canManage = user ? MANAGE_ROLES.includes(user.role) : false;

  const [items, setItems] = useState<Item[]>([]);
  const [myRequests, setMyRequests] = useState<PurchaseRequest[]>([]);
  const [allRequests, setAllRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [justification, setJustification] = useState('');

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const calls: Promise<any>[] = [
        api('/stores/items-lite', { token }),
        api('/procurement/my-requests', { token }),
      ];
      if (canManage) calls.push(api('/procurement/requests', { token }));
      const results = await Promise.all(calls);
      setItems(results[0]);
      setMyRequests(results[1]);
      if (canManage) setAllRequests(results[2]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load procurement data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!itemId || !quantity) {
      setError('Item and quantity are required');
      return;
    }
    try {
      await api('/procurement/requests', {
        method: 'POST',
        token,
        body: { itemId, quantity: Number(quantity), justification: justification || undefined },
      });
      setMessage('Purchase request submitted');
      setItemId('');
      setQuantity('');
      setJustification('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit request');
    }
  }

  async function handleStatus(id: string, status: 'APPROVED' | 'REJECTED' | 'ORDERED' | 'RECEIVED') {
    setError('');
    setMessage('');
    try {
      await api(`/procurement/requests/${id}/status`, { method: 'PATCH', token, body: { status } });
      setMessage(
        status === 'RECEIVED' ? 'Marked received — Stores stock updated' : `Request ${status.toLowerCase()}`
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update request');
    }
  }

  return (
    <PortalLayout title="Purchase Requests">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Purchase Requests</h2>
          <p className="text-sm text-gray-500 mt-1">
            Requests reference existing Stores items — marking one received restocks it automatically.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">{message}</div>
        )}

        <form onSubmit={handleSubmitRequest} className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">New Purchase Request</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">{loading ? 'Loading items...' : 'Select an item'}</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} ({it.quantityOnHand} {it.uom} on hand)
                </option>
              ))}
            </select>
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Justification (optional)"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>
          <button type="submit" className="bg-rgreen text-white text-sm font-medium px-4 py-2 rounded-lg">
            Submit Request
          </button>
        </form>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900 text-sm">My Requests</div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Quantity</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No requests yet</td></tr>
              )}
              {myRequests.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{r.item?.name}</td>
                  <td className="px-4 py-2">{r.quantity} {r.item?.uom}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManage && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-900 text-sm">
              All Requests (Procurement Management)
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2">Requested By</th>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Quantity</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {allRequests.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No requests yet</td></tr>
                )}
                {allRequests.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{r.requestedBy?.name}</td>
                    <td className="px-4 py-2">{r.item?.name}</td>
                    <td className="px-4 py-2">{r.quantity} {r.item?.uom}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100">{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      {r.status === 'PENDING' && (
                        <>
                          <button
                            className="text-green-600 text-xs font-medium"
                            onClick={() => handleStatus(r.id, 'APPROVED')}
                          >
                            Approve
                          </button>
                          <button
                            className="text-red-600 text-xs font-medium"
                            onClick={() => handleStatus(r.id, 'REJECTED')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {r.status === 'APPROVED' && (
                        <button
                          className="text-rgreen text-xs font-medium"
                          onClick={() => handleStatus(r.id, 'ORDERED')}
                        >
                          Mark Ordered
                        </button>
                      )}
                      {r.status === 'ORDERED' && (
                        <button
                          className="text-rgreen text-xs font-medium"
                          onClick={() => handleStatus(r.id, 'RECEIVED')}
                        >
                          Mark Received
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
