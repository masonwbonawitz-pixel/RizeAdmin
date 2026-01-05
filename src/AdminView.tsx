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

interface BuildSession {
  id: string;
  status?: string | null;
  shopify_order_id?: string | null;
  variant_size?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  parameters?: any;
}

export default function AdminView() {
  const [activeTab, setActiveTab] = useState<'orders' | 'printed' | 'shipped' | 'build_sessions'>('orders');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [printedOrders, setPrintedOrders] = useState<Order[]>([]);
  const [shippedOrders, setShippedOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [orderStatuses, setOrderStatuses] = useState<Record<string, { printed: boolean; shipped: boolean }>>({});
  const [selectedPrintedOrders, setSelectedPrintedOrders] = useState<Set<string>>(new Set());
  const [selectedShippedOrders, setSelectedShippedOrders] = useState<Set<string>>(new Set());

  const [buildSessions, setBuildSessions] = useState<BuildSession[]>([]);
  const [isLoadingBuildSessions, setIsLoadingBuildSessions] = useState(false);
  const [selectedBuildSessionId, setSelectedBuildSessionId] = useState<string | null>(null);
  const [buildSessionDraft, setBuildSessionDraft] = useState<{ status?: string | null; shopify_order_id?: string | null; variant_size?: string | null; paid_at?: string | null; parametersText?: string } | null>(null);

  useEffect(() => {
    if (activeTab === 'orders') {
      loadOrders();
    }
    if (activeTab === 'build_sessions') {
      loadBuildSessions();
    }
  }, [activeTab]);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bfgbukjtxmxufgocqfjf.supabase.co';
  const getPublicObjectUrl = (bucket: string, path: string) => {
    const normalizedBucket = bucket.replace(/^\/+|\/+$/g, '');
    const normalizedPath = path.replace(/^\/+/, '');
    return `${supabaseUrl}/storage/v1/object/public/${normalizedBucket}/${normalizedPath}`;
  };

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
  }, []);

  // Helper function to get deleted order IDs from localStorage
  const getDeletedOrderIds = (): Set<string> => {
    const savedDeleted = localStorage.getItem('deletedOrders');
    if (savedDeleted) {
      try {
        return new Set(JSON.parse(savedDeleted));
      } catch (e) {
        console.error('Error loading deleted orders:', e);
        return new Set();
      }
    }
    return new Set();
  };

  // Helper function to save deleted order IDs to localStorage
  const saveDeletedOrderIds = (deletedIds: Set<string>) => {
    localStorage.setItem('deletedOrders', JSON.stringify(Array.from(deletedIds)));
  };

  const loadOrders = async () => {
    setIsLoadingOrders(true);
    setStatusMessage(null);
    try {
      const supabase = getSupabaseClient();
      console.log('🔍 Loading paid orders from build_sessions and orders tables...');
      
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
      
      // Query paid build_sessions and join with orders table to get OBJ URL
      // Only show orders with status = 'paid' (as per spec)
      const { data: buildSessions, error: buildSessionsError } = await supabase
        .from('build_sessions')
        .select(`
          id,
          shopify_order_id,
          variant_size,
          paid_at,
          parameters
        `)
        .eq('status', 'paid')
        .not('shopify_order_id', 'is', null)
        .order('paid_at', { ascending: false });

      if (buildSessionsError) {
        console.error('❌ Supabase query error (build_sessions):', buildSessionsError);
        throw new Error(buildSessionsError.message);
      }

      console.log(`✅ Found ${buildSessions?.length || 0} paid build sessions`);

      // Now get corresponding orders to get OBJ URL and customer info
      const orderIds = buildSessions?.map(bs => bs.shopify_order_id).filter(Boolean) || [];
      
      let ordersData: any[] = [];
      if (orderIds.length > 0) {
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('*')
          .in('shopify_order_id', orderIds);

        if (ordersError) {
          console.error('❌ Supabase query error (orders):', ordersError);
          // Continue even if orders query fails - we can still show build sessions
        } else {
          ordersData = orders || [];
        }
      }

      // Map build sessions to orders, joining with orders table
      if (buildSessions) {
        const mappedOrders: Order[] = buildSessions.map((bs: any) => {
          // Find corresponding order
          const order = ordersData.find(o => o.shopify_order_id === bs.shopify_order_id);
          
          // Extract grid size from parameters or variant_size
          const gridSize = bs.parameters?.gridSize || 
            parseInt(bs.variant_size?.match(/\d+/)?.[0] || '75');

          return {
            id: bs.id, // Use build session ID
            orderId: order?.order_id || bs.id,
            shopifyOrderName: order?.shopify_order_name || bs.shopify_order_id,
            customerName: order?.customer_name || 'Unknown Customer',
            completedAt: bs.paid_at || order?.completed_at,
            fileId: order?.file_id || bs.id,
            gridSize,
          };
        });
        
        console.log('📦 Mapped orders:', mappedOrders);
        
        // Get deleted order IDs
        const deletedOrderIds = getDeletedOrderIds();
        
        // Filter out orders that are already in printed, shipped, or deleted
        const printedOrderIds = new Set(currentPrinted.map((o: Order) => o.id));
        const shippedOrderIds = new Set(currentShipped.map((o: Order) => o.id));
        const activeOrders = mappedOrders.filter(order => 
          !printedOrderIds.has(order.id) && 
          !shippedOrderIds.has(order.id) && 
          !deletedOrderIds.has(order.id)
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

  const loadBuildSessions = async () => {
    setIsLoadingBuildSessions(true);
    setStatusMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('build_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('❌ Supabase query error (build_sessions):', error);
        throw new Error(error.message);
      }

      setBuildSessions((data as any[]) || []);
    } catch (error: any) {
      console.error('Error loading build sessions:', error);
      setStatusMessage({ type: 'error', text: `Error loading build sessions: ${error.message || 'Unknown error'}` });
    } finally {
      setIsLoadingBuildSessions(false);
    }
  };

  const selectBuildSession = (bs: BuildSession) => {
    setSelectedBuildSessionId(bs.id);
    setBuildSessionDraft({
      status: bs.status ?? null,
      shopify_order_id: bs.shopify_order_id ?? null,
      variant_size: bs.variant_size ?? null,
      paid_at: bs.paid_at ?? null,
      parametersText: bs.parameters != null ? JSON.stringify(bs.parameters, null, 2) : '',
    });
  };

  const saveBuildSession = async () => {
    if (!selectedBuildSessionId || !buildSessionDraft) return;
    setStatusMessage(null);
    try {
      const supabase = getSupabaseClient();

      let parsedParameters: any = null;
      const raw = (buildSessionDraft.parametersText ?? '').trim();
      if (raw.length > 0) {
        try {
          parsedParameters = JSON.parse(raw);
        } catch {
          throw new Error('Parameters must be valid JSON');
        }
      }

      const { error } = await supabase
        .from('build_sessions')
        .update({
          status: buildSessionDraft.status ?? null,
          shopify_order_id: buildSessionDraft.shopify_order_id ?? null,
          variant_size: buildSessionDraft.variant_size ?? null,
          paid_at: buildSessionDraft.paid_at ?? null,
          parameters: parsedParameters,
        })
        .eq('id', selectedBuildSessionId);

      if (error) {
        console.error('❌ Supabase update error (build_sessions):', error);
        throw new Error(error.message);
      }

      setStatusMessage({ type: 'success', text: 'Build session updated' });
      await loadBuildSessions();
    } catch (error: any) {
      console.error('Error saving build session:', error);
      setStatusMessage({ type: 'error', text: `Error saving build session: ${error.message || 'Unknown error'}` });
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
    
    // Add to deleted orders
    const deletedIds = getDeletedOrderIds();
    selectedShippedOrders.forEach(id => deletedIds.add(id));
    saveDeletedOrderIds(deletedIds);
    
    // Remove from shipped orders
    setShippedOrders(prev => {
      const updated = prev.filter(order => !selectedShippedOrders.has(order.id));
      localStorage.setItem('shippedOrders', JSON.stringify(updated));
      return updated;
    });
    
    setStatusMessage({ type: 'success', text: `${selectedShippedOrders.size} order(s) deleted` });
    setSelectedShippedOrders(new Set());
  };

  const deleteSelectedPrintedOrders = () => {
    if (selectedPrintedOrders.size === 0) {
      setStatusMessage({ type: 'error', text: 'No orders selected to delete' });
      return;
    }
    
    // Add to deleted orders
    const deletedIds = getDeletedOrderIds();
    selectedPrintedOrders.forEach(id => deletedIds.add(id));
    saveDeletedOrderIds(deletedIds);
    
    // Remove from printed orders
    setPrintedOrders(prev => {
      const updated = prev.filter(order => !selectedPrintedOrders.has(order.id));
      localStorage.setItem('printedOrders', JSON.stringify(updated));
      return updated;
    });
    
    setStatusMessage({ type: 'success', text: `${selectedPrintedOrders.size} order(s) deleted` });
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

  const downloadObjWithFilePicker = async (objUrl: string, defaultFilename: string) => {
    try {
      // Check if File System Access API is supported
      if ('showSaveFilePicker' in window) {
        // Fetch the file
        const response = await fetch(objUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch OBJ file');
        }
        const blob = await response.blob();
        
        // Show file picker
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: defaultFilename,
          types: [{
            description: 'OBJ Files',
            accept: { 'model/obj': ['.obj'] },
          }],
        });
        
        // Write the file
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        
        setStatusMessage({ type: 'success', text: 'File saved successfully' });
      } else {
        // Fallback for browsers that don't support File System Access API
        const link = document.createElement('a');
        link.href = objUrl;
        link.download = defaultFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setStatusMessage({ type: 'success', text: 'Download started' });
      }
    } catch (error: any) {
      // User cancelled the file picker
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Error downloading OBJ file:', error);
      setStatusMessage({ 
        type: 'error', 
        text: `Error downloading file: ${error.message || 'Unknown error'}` 
      });
    }
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
          <button
            onClick={() => setActiveTab('build_sessions')}
            style={{
              padding: '8px 20px',
              background: activeTab === 'build_sessions' ? 'white' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'build_sessions' ? '#2d5016' : 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Build Sessions
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
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', width: '30px' }}></th>
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
                        
                        const imageUrl = order.fileId ? getPublicObjectUrl('previews', `${order.fileId}_preview.png`) : null;
                        const objUrl = order.fileId ? getPublicObjectUrl('orders', `${order.fileId}.obj`) : null;
                        const stlUrl = order.fileId ? getPublicObjectUrl('previews', `${order.fileId}.stl`) : null;
                        
                        const downloadFilename = `${sanitizeFilename(order.customerName)}_${String(order.gridSize || 0)}x${String(order.gridSize || 0)}.obj`;
                        const status = orderStatuses[order.id] || { printed: false, shipped: false };
                        
                        return (
                          <tr key={order.id} style={{ borderBottom: '1px solid #eee', background: status.shipped ? '#e3f2fd' : 'white' }}>
                            <td style={{ padding: '12px' }}></td>
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
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {objUrl ? (
                                  <button
                                    onClick={() => downloadObjWithFilePicker(objUrl, downloadFilename)}
                                    style={{
                                      color: '#007ace',
                                      textDecoration: 'none',
                                      fontWeight: '500',
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: 0,
                                      font: 'inherit',
                                      textAlign: 'left',
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                  >
                                    Download OBJ
                                  </button>
                                ) : (
                                  <span style={{ color: '#999' }}>No OBJ</span>
                                )}
                                {stlUrl ? (
                                  <a
                                    href={stlUrl}
                                    download
                                    style={{
                                      color: '#007ace',
                                      textDecoration: 'none',
                                      fontWeight: '500',
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                  >
                                    Download STL
                                  </a>
                                ) : (
                                  <span style={{ color: '#999' }}>No STL</span>
                                )}
                              </div>
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

        {activeTab === 'build_sessions' && (
          <Card>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Build Sessions</h2>
                <Button onClick={loadBuildSessions} disabled={isLoadingBuildSessions}>
                  {isLoadingBuildSessions ? 'Loading...' : 'Refresh'}
                </Button>
              </div>

              {isLoadingBuildSessions ? (
                <div style={{ padding: '20px', textAlign: 'center' }}>
                  <p>Loading build sessions from Supabase...</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', alignItems: 'start' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #ddd', background: '#f5f5f5' }}>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>ID</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Status</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Shopify Order</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Variant</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Paid At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buildSessions.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: '20px', color: '#666' }}>No build sessions found.</td>
                          </tr>
                        ) : (
                          buildSessions.map((bs) => {
                            const isSelected = selectedBuildSessionId === bs.id;
                            return (
                              <tr
                                key={bs.id}
                                onClick={() => selectBuildSession(bs)}
                                style={{
                                  borderBottom: '1px solid #eee',
                                  cursor: 'pointer',
                                  background: isSelected ? '#e3f2fd' : 'white',
                                }}
                              >
                                <td style={{ padding: '12px', fontFamily: 'monospace' }}>{bs.id}</td>
                                <td style={{ padding: '12px' }}>{bs.status ?? '-'}</td>
                                <td style={{ padding: '12px' }}>{bs.shopify_order_id ?? '-'}</td>
                                <td style={{ padding: '12px' }}>{bs.variant_size ?? '-'}</td>
                                <td style={{ padding: '12px' }}>{bs.paid_at ? new Date(bs.paid_at).toLocaleString() : '-'}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ border: '1px solid #eee', borderRadius: '8px', padding: '16px', background: 'white' }}>
                    {!selectedBuildSessionId || !buildSessionDraft ? (
                      <div style={{ color: '#666' }}>Select a build session to edit.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666' }}>Editing</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>{selectedBuildSessionId}</div>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontWeight: 600 }}>Status</span>
                          <input
                            value={buildSessionDraft.status ?? ''}
                            onChange={(e) => setBuildSessionDraft((d) => (d ? { ...d, status: e.target.value } : d))}
                            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                          />
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontWeight: 600 }}>Shopify Order ID</span>
                          <input
                            value={buildSessionDraft.shopify_order_id ?? ''}
                            onChange={(e) => setBuildSessionDraft((d) => (d ? { ...d, shopify_order_id: e.target.value } : d))}
                            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                          />
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontWeight: 600 }}>Variant Size</span>
                          <input
                            value={buildSessionDraft.variant_size ?? ''}
                            onChange={(e) => setBuildSessionDraft((d) => (d ? { ...d, variant_size: e.target.value } : d))}
                            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                          />
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontWeight: 600 }}>Paid At (ISO or empty)</span>
                          <input
                            value={buildSessionDraft.paid_at ?? ''}
                            onChange={(e) => setBuildSessionDraft((d) => (d ? { ...d, paid_at: e.target.value } : d))}
                            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                          />
                        </label>

                        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <span style={{ fontWeight: 600 }}>Parameters (JSON)</span>
                          <textarea
                            value={buildSessionDraft.parametersText ?? ''}
                            onChange={(e) => setBuildSessionDraft((d) => (d ? { ...d, parametersText: e.target.value } : d))}
                            rows={10}
                            style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontFamily: 'monospace' }}
                          />
                        </label>

                        <Button onClick={saveBuildSession} tone="success">
                          Save
                        </Button>
                      </div>
                    )}
                  </div>
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

                        const imageUrl = order.fileId ? getPublicObjectUrl('previews', `${order.fileId}_preview.png`) : null;
                        const objUrl = order.fileId ? getPublicObjectUrl('orders', `${order.fileId}.obj`) : null;
                        const stlUrl = order.fileId ? getPublicObjectUrl('previews', `${order.fileId}.stl`) : null;
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
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {objUrl ? (
                                  <button
                                    onClick={() => downloadObjWithFilePicker(objUrl, downloadFilename)}
                                    style={{
                                      color: '#007ace',
                                      textDecoration: 'none',
                                      fontWeight: '500',
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: 0,
                                      font: 'inherit',
                                      textAlign: 'left',
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                  >
                                    Download OBJ
                                  </button>
                                ) : (
                                  <span style={{ color: '#999' }}>No OBJ</span>
                                )}
                                {stlUrl ? (
                                  <a
                                    href={stlUrl}
                                    download
                                    style={{
                                      color: '#007ace',
                                      textDecoration: 'none',
                                      fontWeight: '500',
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                  >
                                    Download STL
                                  </a>
                                ) : (
                                  <span style={{ color: '#999' }}>No STL</span>
                                )}
                              </div>
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

                        const imageUrl = order.fileId ? getPublicObjectUrl('previews', `${order.fileId}_preview.png`) : null;
                        const objUrl = order.fileId ? getPublicObjectUrl('orders', `${order.fileId}.obj`) : null;
                        const stlUrl = order.fileId ? getPublicObjectUrl('previews', `${order.fileId}.stl`) : null;
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
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {objUrl ? (
                                  <button
                                    onClick={() => downloadObjWithFilePicker(objUrl, downloadFilename)}
                                    style={{
                                      color: '#007ace',
                                      textDecoration: 'none',
                                      fontWeight: '500',
                                      background: 'none',
                                      border: 'none',
                                      cursor: 'pointer',
                                      padding: 0,
                                      font: 'inherit',
                                      textAlign: 'left',
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                  >
                                    Download OBJ
                                  </button>
                                ) : (
                                  <span style={{ color: '#999' }}>No OBJ</span>
                                )}
                                {stlUrl ? (
                                  <a
                                    href={stlUrl}
                                    download
                                    style={{
                                      color: '#007ace',
                                      textDecoration: 'none',
                                      fontWeight: '500',
                                    }}
                                    onMouseOver={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                                    onMouseOut={(e) => (e.currentTarget.style.textDecoration = 'none')}
                                  >
                                    Download STL
                                  </a>
                                ) : (
                                  <span style={{ color: '#999' }}>No STL</span>
                                )}
                              </div>
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

