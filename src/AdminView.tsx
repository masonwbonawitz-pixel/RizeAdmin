import { useState, useEffect } from 'react';
import { Card, Button, Banner } from '@shopify/polaris';
import { getSupabaseClient } from './services/supabaseClient';

interface Order {
  id: string;
  orderId: string;
  shopifyOrderName?: string;
  customerName: string;
  completedAt: string;
  fileId?: string;
  gridSize?: number;
}

export default function AdminView() {
  const [activeTab, setActiveTab] = useState<'orders' | 'printed' | 'shipped'>('orders');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [printedOrders, setPrintedOrders] = useState<Order[]>([]);
  const [shippedOrders, setShippedOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [orderStatuses, setOrderStatuses] = useState<Record<string, { printed: boolean; shipped: boolean }>>({});
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedPrintedOrders, setSelectedPrintedOrders] = useState<Set<string>>(new Set());
  const [selectedShippedOrders, setSelectedShippedOrders] = useState<Set<string>>(new Set());
  const [deletedOrders, setDeletedOrders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeTab === 'orders') {
      loadOrders();
    }
  }, [activeTab]);

  // Load printed and shipped orders from localStorage on mount
  useEffect(() => {
    const savedPrinted = localStorage.getItem('printedOrders');
    if (savedPrinted) {
      try {
        setPrintedOrders(JSON.parse(savedPrinted));
      } catch (e) {
        console.error('Error loading printed orders:', e);
      }
    }
    const savedShipped = localStorage.getItem('shippedOrders');
    if (savedShipped) {
      try {
        setShippedOrders(JSON.parse(savedShipped));
      } catch (e) {
        console.error('Error loading shipped orders:', e);
      }
    }
    const savedStatuses = localStorage.getItem('orderStatuses');
    if (savedStatuses) {
      try {
        setOrderStatuses(JSON.parse(savedStatuses));
      } catch (e) {
        console.error('Error loading order statuses:', e);
      }
    }
    const savedDeleted = localStorage.getItem('deletedOrders');
    if (savedDeleted) {
      try {
        setDeletedOrders(new Set(JSON.parse(savedDeleted)));
      } catch (e) {
        console.error('Error loading deleted orders:', e);
      }
    }
  }, []);

  const loadOrders = async () => {
    setIsLoadingOrders(true);
    setStatusMessage(null);
    try {
      const supabase = getSupabaseClient();
      console.log('🔍 Loading orders from jobs table...');
      
      // Load printed and shipped orders from localStorage to filter them out
      const savedPrinted = localStorage.getItem('printedOrders');
      let currentPrinted: Order[] = [];
      if (savedPrinted) {
        try {
          currentPrinted = JSON.parse(savedPrinted);
          setPrintedOrders(currentPrinted);
        } catch (e) {
          console.error('Error loading printed orders:', e);
        }
      }
      const savedShipped = localStorage.getItem('shippedOrders');
      let currentShipped: Order[] = [];
      if (savedShipped) {
        try {
          currentShipped = JSON.parse(savedShipped);
          setShippedOrders(currentShipped);
        } catch (e) {
          console.error('Error loading shipped orders:', e);
        }
      }
      
      // Query completed jobs from the jobs table - this has all the data we need
      const { data, error } = await supabase
        .from('jobs')
        .select('id, job_id, file_id, grid_size, completed_at')
        .eq('status', 'completed')
        .not('file_id', 'is', null)
        .order('completed_at', { ascending: false });

      if (error) {
        console.error('❌ Supabase query error:', error);
        throw new Error(error.message);
      }

      console.log(`✅ Found ${data?.length || 0} completed jobs in Supabase`);
      if (data) {
        const mappedOrders: Order[] = data.map((row: any) => ({
          id: row.id,
          orderId: row.job_id,
          shopifyOrderName: undefined, // Jobs table doesn't have Shopify order info
          customerName: 'Cart Customer', // Jobs table doesn't have customer name, use default
          completedAt: row.completed_at || row.updated_at,
          fileId: row.file_id,
          gridSize: row.grid_size,
        }));
        console.log('📦 Mapped orders:', mappedOrders);
        
        // Load deleted orders from localStorage
        const savedDeleted = localStorage.getItem('deletedOrders');
        const currentDeleted = savedDeleted ? new Set(JSON.parse(savedDeleted)) : new Set<string>();
        
        // Filter out orders that are already in printed, shipped, or deleted
        const printedOrderIds = new Set(currentPrinted.map((o: Order) => o.id));
        const shippedOrderIds = new Set(currentShipped.map((o: Order) => o.id));
        const activeOrders = mappedOrders.filter(order => 
          !printedOrderIds.has(order.id) && 
          !shippedOrderIds.has(order.id) && 
          !currentDeleted.has(order.id)
        );
        setOrders(activeOrders);
      }
    } catch (error) {
      console.error('❌ Error loading orders:', error);
      setStatusMessage({ 
        type: 'error', 
        text: `Error loading orders: ${error instanceof Error ? error.message : 'Failed to connect to Supabase'}` 
      });
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleStatusChange = (orderId: string, field: 'printed' | 'shipped', value: boolean) => {
    setOrderStatuses(prev => {
      const updated = {
        ...prev,
        [orderId]: {
          ...prev[orderId],
          [field]: value,
        }
      };
      localStorage.setItem('orderStatuses', JSON.stringify(updated));
      return updated;
    });
  };

  const confirmPrintOrders = () => {
    const ordersToPrint = orders.filter(order => orderStatuses[order.id]?.printed);
    if (ordersToPrint.length === 0) {
      setStatusMessage({ type: 'error', text: 'No orders marked as printed to confirm' });
      return;
    }
    
    setPrintedOrders(prev => {
      const updated = [...prev, ...ordersToPrint];
      localStorage.setItem('printedOrders', JSON.stringify(updated));
      return updated;
    });
    
    setOrders(prev => prev.filter(order => !orderStatuses[order.id]?.printed));
    setOrderStatuses(prev => {
      const updated = { ...prev };
      ordersToPrint.forEach(order => {
        delete updated[order.id];
      });
      localStorage.setItem('orderStatuses', JSON.stringify(updated));
      return updated;
    });
  };

  const confirmShipOrders = () => {
    const ordersToShip = orders.filter(order => orderStatuses[order.id]?.shipped);
    if (ordersToShip.length === 0) {
      setStatusMessage({ type: 'error', text: 'No orders marked as shipped to confirm' });
      return;
    }
    
    setShippedOrders(prev => {
      const updated = [...prev, ...ordersToShip];
      localStorage.setItem('shippedOrders', JSON.stringify(updated));
      return updated;
    });
    
    setOrders(prev => prev.filter(order => !orderStatuses[order.id]?.shipped));
    setOrderStatuses(prev => {
      const updated = { ...prev };
      ordersToShip.forEach(order => {
        delete updated[order.id];
      });
      localStorage.setItem('orderStatuses', JSON.stringify(updated));
      return updated;
    });
  };

  const handleSelectOrder = (orderId: string, selected: boolean) => {
    setSelectedOrders(prev => {
      const updated = new Set(prev);
      if (selected) {
        updated.add(orderId);
      } else {
        updated.delete(orderId);
      }
      return updated;
    });
  };

  const handleSelectAllOrders = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedOrders(new Set(orders.map(o => o.id)));
    } else {
      setSelectedOrders(new Set());
    }
  };

  const markSelectedOrdersAsPrinted = () => {
    if (selectedOrders.size === 0) {
      setStatusMessage({ type: 'error', text: 'No orders selected' });
      return;
    }

    const ordersToMark = orders.filter(order => selectedOrders.has(order.id));
    
    setOrderStatuses(prev => {
      const updated = { ...prev };
      ordersToMark.forEach(order => {
        updated[order.id] = {
          ...prev[order.id],
          printed: true,
        };
      });
      localStorage.setItem('orderStatuses', JSON.stringify(updated));
      return updated;
    });
    
    setSelectedOrders(new Set());
  };

  const deleteSelectedOrders = () => {
    if (selectedOrders.size === 0) {
      setStatusMessage({ type: 'error', text: 'No orders selected to delete' });
      return;
    }
    
    setDeletedOrders(prev => {
      const updated = new Set(prev);
      selectedOrders.forEach(id => updated.add(id));
      localStorage.setItem('deletedOrders', JSON.stringify(Array.from(updated)));
      return updated;
    });
    
    setOrders(prev => prev.filter(order => !selectedOrders.has(order.id)));
    setSelectedOrders(new Set());
  };

  const handleSelectPrintedOrder = (orderId: string, selected: boolean) => {
    setSelectedPrintedOrders(prev => {
      const updated = new Set(prev);
      if (selected) {
        updated.add(orderId);
      } else {
        updated.delete(orderId);
      }
      return updated;
    });
  };

  const handleSelectAllPrinted = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedPrintedOrders(new Set(printedOrders.map(o => o.id)));
    } else {
      setSelectedPrintedOrders(new Set());
    }
  };

  const handleSelectShippedOrder = (orderId: string, selected: boolean) => {
    setSelectedShippedOrders(prev => {
      const updated = new Set(prev);
      if (selected) {
        updated.add(orderId);
      } else {
        updated.delete(orderId);
      }
      return updated;
    });
  };

  const handleSelectAllShipped = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedShippedOrders(new Set(shippedOrders.map(o => o.id)));
    } else {
      setSelectedShippedOrders(new Set());
    }
  };

  const deleteSelectedShippedOrders = () => {
    if (selectedShippedOrders.size === 0) {
      setStatusMessage({ type: 'error', text: 'No orders selected to delete' });
      return;
    }
    
    setDeletedOrders(prev => {
      const updated = new Set(prev);
      selectedShippedOrders.forEach(id => updated.add(id));
      localStorage.setItem('deletedOrders', JSON.stringify(Array.from(updated)));
      return updated;
    });
    
    setShippedOrders(prev => {
      const updated = prev.filter(order => !selectedShippedOrders.has(order.id));
      localStorage.setItem('shippedOrders', JSON.stringify(updated));
      return updated;
    });
    
    setSelectedShippedOrders(new Set());
  };

  const deleteSelectedPrintedOrders = () => {
    if (selectedPrintedOrders.size === 0) {
      setStatusMessage({ type: 'error', text: 'No orders selected to delete' });
      return;
    }
    
    setDeletedOrders(prev => {
      const updated = new Set(prev);
      selectedPrintedOrders.forEach(id => updated.add(id));
      localStorage.setItem('deletedOrders', JSON.stringify(Array.from(updated)));
      return updated;
    });
    
    setPrintedOrders(prev => {
      const updated = prev.filter(order => !selectedPrintedOrders.has(order.id));
      localStorage.setItem('printedOrders', JSON.stringify(updated));
      return updated;
    });
    
    setSelectedPrintedOrders(new Set());
  };

  const sendPrintedToOrders = () => {
    if (selectedPrintedOrders.size === 0) {
      setStatusMessage({ type: 'error', text: 'No orders selected' });
      return;
    }

    const ordersToMove = printedOrders.filter(order => selectedPrintedOrders.has(order.id));
    
    setOrders(prev => {
      const updated = [...prev, ...ordersToMove];
      return updated;
    });
    
    setPrintedOrders(prev => {
      const updated = prev.filter(order => !selectedPrintedOrders.has(order.id));
      localStorage.setItem('printedOrders', JSON.stringify(updated));
      return updated;
    });

    setOrderStatuses(prev => {
      const updated = { ...prev };
      ordersToMove.forEach(order => {
        if (updated[order.id]) {
          updated[order.id] = {
            ...updated[order.id],
            printed: false,
          };
        } else {
          updated[order.id] = { printed: false, shipped: false };
        }
      });
      localStorage.setItem('orderStatuses', JSON.stringify(updated));
      return updated;
    });
    
    setSelectedPrintedOrders(new Set());
  };

  const markPrintedAsShipped = () => {
    if (selectedPrintedOrders.size === 0) {
      setStatusMessage({ type: 'error', text: 'No orders selected' });
      return;
    }

    const ordersToMove = printedOrders.filter(order => selectedPrintedOrders.has(order.id));
    
    setShippedOrders(prev => {
      const updated = [...prev, ...ordersToMove];
      localStorage.setItem('shippedOrders', JSON.stringify(updated));
      return updated;
    });
    
    setPrintedOrders(prev => {
      const updated = prev.filter(order => !selectedPrintedOrders.has(order.id));
      localStorage.setItem('printedOrders', JSON.stringify(updated));
      return updated;
    });

    setOrderStatuses(prev => {
      const updated = { ...prev };
      ordersToMove.forEach(order => {
        if (updated[order.id]) {
          updated[order.id] = {
            ...updated[order.id],
            printed: false,
            shipped: true,
          };
        } else {
          updated[order.id] = { printed: false, shipped: true };
        }
      });
      localStorage.setItem('orderStatuses', JSON.stringify(updated));
      return updated;
    });
    
    setSelectedPrintedOrders(new Set());
  };

  const markShippedAsPrinted = () => {
    if (selectedShippedOrders.size === 0) {
      setStatusMessage({ type: 'error', text: 'No orders selected' });
      return;
    }

    const ordersToMove = shippedOrders.filter(order => selectedShippedOrders.has(order.id));
    
    setPrintedOrders(prev => {
      const updated = [...prev, ...ordersToMove];
      localStorage.setItem('printedOrders', JSON.stringify(updated));
      return updated;
    });
    
    setShippedOrders(prev => {
      const updated = prev.filter(order => !selectedShippedOrders.has(order.id));
      localStorage.setItem('shippedOrders', JSON.stringify(updated));
      return updated;
    });

    setOrderStatuses(prev => {
      const updated = { ...prev };
      ordersToMove.forEach(order => {
        if (updated[order.id]) {
          updated[order.id] = {
            ...updated[order.id],
            printed: true,
            shipped: false,
          };
        } else {
          updated[order.id] = { printed: true, shipped: false };
        }
      });
      localStorage.setItem('orderStatuses', JSON.stringify(updated));
      return updated;
    });
    
    setSelectedShippedOrders(new Set());
  };

  const sanitizeFilename = (name: string) => {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FFFBF5' }}>
      <div style={{ background: '#2d5016', color: 'white', padding: '15px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', marginBottom: '10px' }}>Admin Panel</h1>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={() => setActiveTab('orders')}
            style={{
              padding: '8px 20px',
              background: activeTab === 'orders' ? 'white' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'orders' ? '#2d5016' : 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Orders ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('printed')}
            style={{
              padding: '8px 20px',
              background: activeTab === 'printed' ? 'white' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'printed' ? '#2d5016' : 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Printed ({printedOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('shipped')}
            style={{
              padding: '8px 20px',
              background: activeTab === 'shipped' ? 'white' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'shipped' ? '#2d5016' : 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Shipped ({shippedOrders.length})
          </button>
        </div>
      </div>

      <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
        {statusMessage && (
          <div style={{ marginBottom: '20px' }}>
            <Banner
              title={statusMessage.text}
              tone={statusMessage.type === 'error' ? 'critical' : 'success'}
              onDismiss={() => setStatusMessage(null)}
            />
          </div>
        )}

        {activeTab === 'orders' && (
          <Card>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Orders</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Button onClick={() => handleSelectAllOrders(selectedOrders.size < orders.length)}>
                    {selectedOrders.size === orders.length && orders.length > 0 ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedOrders.size > 0 && (
                    <Button onClick={markSelectedOrdersAsPrinted} tone="success">
                      Mark as Printed ({String(selectedOrders.size)})
                    </Button>
                  )}
                  {selectedOrders.size > 0 && (
                    <Button onClick={deleteSelectedOrders} tone="critical">
                      Delete Selected ({String(selectedOrders.size)})
                    </Button>
                  )}
                  {orders.filter(o => orderStatuses[o.id]?.printed).length > 0 && (
                    <Button onClick={confirmPrintOrders} tone="success">
                      Confirm Print ({String(orders.filter(o => orderStatuses[o.id]?.printed).length)})
                    </Button>
                  )}
                  {orders.filter(o => orderStatuses[o.id]?.shipped).length > 0 && (
                    <Button onClick={confirmShipOrders} tone="success">
                      Confirm Ship ({String(orders.filter(o => orderStatuses[o.id]?.shipped).length)})
                    </Button>
                  )}
                  <Button onClick={loadOrders} disabled={isLoadingOrders}>
                    {isLoadingOrders ? 'Loading...' : 'Refresh'}
                  </Button>
                </div>
              </div>
              
              {isLoadingOrders ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <p>Loading orders from Supabase...</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #ddd', background: '#f5f5f5' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', width: '30px' }}>
                          <input
                            type="checkbox"
                            checked={selectedOrders.size === orders.length && orders.length > 0}
                            onChange={(e) => handleSelectAllOrders(e.target.checked)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                        </th>
                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', width: '80px' }}>Printed</th>
                        <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', width: '80px' }}>Shipped</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Name</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Date and Time</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Size</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Image</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Download</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Order ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                            <p>No orders found in the database.</p>
                            <p style={{ fontSize: '14px', marginTop: '10px' }}>
                              Orders will appear here automatically when customers complete purchases via Shopify.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        orders.map((order) => {
                        const completedDate = new Date(order.completedAt);
                        const formattedDate = completedDate.toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        });
                        
                        // Construct URLs for files in temp bucket - use direct Supabase storage URL format
                        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bfgbukjtxmxufgocqfjf.supabase.co';
                        const bucketName = 'objs';
                        const imageUrl = order.fileId 
                          ? `${supabaseUrl}/storage/v1/object/public/${bucketName}/temp/${order.fileId}_preview.png`
                          : null;
                        const objUrl = order.fileId 
                          ? `${supabaseUrl}/storage/v1/object/public/${bucketName}/temp/${order.fileId}.obj`
                          : null;
                        
                        const downloadFilename = `${sanitizeFilename(order.customerName)}_${String(order.gridSize || 0)}x${String(order.gridSize || 0)}.obj`;
                        const status = orderStatuses[order.id] || { printed: false, shipped: false };
                        
                        const isSelected = selectedOrders.has(order.id);
                        return (
                          <tr key={order.id} style={{ borderBottom: '1px solid #eee', background: status.shipped ? '#fff3cd' : isSelected ? '#e3f2fd' : 'white' }}>
                            <td style={{ padding: '12px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleSelectOrder(order.id, e.target.checked)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={status.printed}
                                onChange={(e) => handleStatusChange(order.id, 'printed', e.target.checked)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={status.shipped}
                                onChange={(e) => handleStatusChange(order.id, 'shipped', e.target.checked)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '12px' }}>{order.customerName}</td>
                            <td style={{ padding: '12px' }}>{formattedDate}</td>
                            <td style={{ padding: '12px' }}>{order.gridSize ? `${order.gridSize}×${order.gridSize}` : '-'}</td>
                            <td style={{ padding: '12px' }}>
                              {imageUrl ? (
                                <a
                                  href={imageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: '#007ace',
                                    textDecoration: 'none',
                                    fontWeight: '500',
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                  onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                                >
                                  View Image
                                </a>
                              ) : (
                                <span style={{ color: '#999' }}>No image</span>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {objUrl ? (
                                <a
                                  href={objUrl}
                                  download={downloadFilename}
                                  style={{
                                    color: '#007ace',
                                    textDecoration: 'none',
                                    fontWeight: '500',
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                  onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                                >
                                  Download OBJ
                                </a>
                              ) : (
                                <span style={{ color: '#999' }}>No file</span>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {order.shopifyOrderName || order.orderId}
                            </td>
                          </tr>
                        );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'printed' && (
          <Card>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Printed Orders</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Button onClick={() => handleSelectAllPrinted(selectedPrintedOrders.size < printedOrders.length)}>
                    {selectedPrintedOrders.size === printedOrders.length && printedOrders.length > 0 ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedPrintedOrders.size > 0 && (
                    <>
                      <Button onClick={sendPrintedToOrders} tone="success">
                        Send to Orders ({String(selectedPrintedOrders.size)})
                      </Button>
                      <Button onClick={markPrintedAsShipped} tone="success">
                        Mark as Shipped ({String(selectedPrintedOrders.size)})
                      </Button>
                    </>
                  )}
                  <Button onClick={deleteSelectedPrintedOrders} tone="critical" disabled={selectedPrintedOrders.size === 0}>
                    Delete Selected ({String(selectedPrintedOrders.size)})
                  </Button>
                </div>
              </div>
              
              {printedOrders.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  <p>No printed orders yet.</p>
                  <p style={{ fontSize: '14px', marginTop: '10px' }}>
                    Mark orders as printed and confirm them to move them here.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #ddd', background: '#f5f5f5' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', width: '30px' }}>
                          <input
                            type="checkbox"
                            checked={selectedPrintedOrders.size === printedOrders.length && printedOrders.length > 0}
                            onChange={(e) => handleSelectAllPrinted(e.target.checked)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                        </th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Name</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Date and Time</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Size</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Image</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Download</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Order ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printedOrders.map((order) => {
                        const completedDate = new Date(order.completedAt);
                        const formattedDate = completedDate.toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        });
                        
                        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bfgbukjtxmxufgocqfjf.supabase.co';
                        const bucketName = 'objs';
                        const imageUrl = order.fileId 
                          ? `${supabaseUrl}/storage/v1/object/public/${bucketName}/temp/${order.fileId}_preview.png`
                          : null;
                        const objUrl = order.fileId 
                          ? `${supabaseUrl}/storage/v1/object/public/${bucketName}/temp/${order.fileId}.obj`
                          : null;
                        const downloadFilename = `${sanitizeFilename(order.customerName)}_${String(order.gridSize || 0)}x${String(order.gridSize || 0)}.obj`;
                        const isSelected = selectedPrintedOrders.has(order.id);
                        
                        return (
                          <tr key={order.id} style={{ borderBottom: '1px solid #eee', background: isSelected ? '#e3f2fd' : 'white' }}>
                            <td style={{ padding: '12px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleSelectPrintedOrder(order.id, e.target.checked)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '12px' }}>{order.customerName}</td>
                            <td style={{ padding: '12px' }}>{formattedDate}</td>
                            <td style={{ padding: '12px' }}>{order.gridSize ? `${order.gridSize}×${order.gridSize}` : '-'}</td>
                            <td style={{ padding: '12px' }}>
                              {imageUrl ? (
                                <a
                                  href={imageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: '#007ace',
                                    textDecoration: 'none',
                                    fontWeight: '500',
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                  onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                                >
                                  View Image
                                </a>
                              ) : (
                                <span style={{ color: '#999' }}>No image</span>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {objUrl ? (
                                <a
                                  href={objUrl}
                                  download={downloadFilename}
                                  style={{
                                    color: '#007ace',
                                    textDecoration: 'none',
                                    fontWeight: '500',
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                  onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                                >
                                  Download OBJ
                                </a>
                              ) : (
                                <span style={{ color: '#999' }}>No file</span>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {order.shopifyOrderName || order.orderId}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'shipped' && (
          <Card>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Shipped Orders</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Button onClick={() => handleSelectAllShipped(selectedShippedOrders.size < shippedOrders.length)}>
                    {selectedShippedOrders.size === shippedOrders.length && shippedOrders.length > 0 ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedShippedOrders.size > 0 && (
                    <Button onClick={markShippedAsPrinted} tone="success">
                      Mark as Printed ({String(selectedShippedOrders.size)})
                    </Button>
                  )}
                  <Button onClick={deleteSelectedShippedOrders} tone="critical" disabled={selectedShippedOrders.size === 0}>
                    Delete Selected ({String(selectedShippedOrders.size)})
                  </Button>
                </div>
              </div>
              
              {shippedOrders.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  <p>No shipped orders yet.</p>
                  <p style={{ fontSize: '14px', marginTop: '10px' }}>
                    Mark orders as shipped and confirm them to move them here.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #ddd', background: '#f5f5f5' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', width: '30px' }}>
                          <input
                            type="checkbox"
                            checked={selectedShippedOrders.size === shippedOrders.length && shippedOrders.length > 0}
                            onChange={(e) => handleSelectAllShipped(e.target.checked)}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                        </th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Name</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Date and Time</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Size</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Image</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Download</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Order ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shippedOrders.map((order) => {
                        const completedDate = new Date(order.completedAt);
                        const formattedDate = completedDate.toLocaleString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        });
                        
                        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bfgbukjtxmxufgocqfjf.supabase.co';
                        const bucketName = 'objs';
                        const imageUrl = order.fileId 
                          ? `${supabaseUrl}/storage/v1/object/public/${bucketName}/temp/${order.fileId}_preview.png`
                          : null;
                        const objUrl = order.fileId 
                          ? `${supabaseUrl}/storage/v1/object/public/${bucketName}/temp/${order.fileId}.obj`
                          : null;
                        const downloadFilename = `${sanitizeFilename(order.customerName)}_${String(order.gridSize || 0)}x${String(order.gridSize || 0)}.obj`;
                        const isSelected = selectedShippedOrders.has(order.id);
                        
                        return (
                          <tr key={order.id} style={{ borderBottom: '1px solid #eee', background: isSelected ? '#e3f2fd' : 'white' }}>
                            <td style={{ padding: '12px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleSelectShippedOrder(order.id, e.target.checked)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '12px' }}>{order.customerName}</td>
                            <td style={{ padding: '12px' }}>{formattedDate}</td>
                            <td style={{ padding: '12px' }}>{order.gridSize ? `${order.gridSize}×${order.gridSize}` : '-'}</td>
                            <td style={{ padding: '12px' }}>
                              {imageUrl ? (
                                <a
                                  href={imageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: '#007ace',
                                    textDecoration: 'none',
                                    fontWeight: '500',
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                  onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                                >
                                  View Image
                                </a>
                              ) : (
                                <span style={{ color: '#999' }}>No image</span>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {objUrl ? (
                                <a
                                  href={objUrl}
                                  download={downloadFilename}
                                  style={{
                                    color: '#007ace',
                                    textDecoration: 'none',
                                    fontWeight: '500',
                                  }}
                                  onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                  onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                                >
                                  Download OBJ
                                </a>
                              ) : (
                                <span style={{ color: '#999' }}>No file</span>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {order.shopifyOrderName || order.orderId}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}

