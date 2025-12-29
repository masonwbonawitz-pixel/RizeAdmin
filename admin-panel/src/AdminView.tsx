import { useState, useEffect } from 'react';
import { Card, Button, Banner, Layout } from '@shopify/polaris';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001'
    : 'https://rizealbums3.onrender.com');

interface Order {
  id: string;
  orderId: string;
  shopifyOrderId?: string;
  shopifyOrderName?: string;
  customerName: string;
  customerEmail?: string;
  price: number;
  gridSize: number;
  objUrl: string;
  fileId?: string;
  jobId?: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminView() {
  const [activeTab, setActiveTab] = useState<'edit' | 'orders' | 'converter' | 'objRepair'>('edit');
  const [prices, setPrices] = useState({
    '48x48': 39.99,
    '75x75': 49.99,
    '96x96': 59.99,
    stand: 10.00,
    wall_mounting_dots: 5.99,
  });
  const [content, setContent] = useState({
    title: '3D Album Cover Mosaic Builder',
    price_subtitle: 'Create colorized 3D prints',
    upload_image_text: 'Choose image file...',
    upload_subtext: 'Will be resized to 75×75 pixels',
  });
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [plyFile, setPlyFile] = useState<File | null>(null);
  const [objFile, setObjFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') {
      loadOrders();
    }
  }, [activeTab]);

  const loadData = async () => {
    try {
      const [pricesRes, contentRes] = await Promise.all([
        fetch(`${BACKEND_URL}/admin/prices/api`).catch(() => null),
        fetch(`${BACKEND_URL}/admin/content/api`).catch(() => null),
      ]);
      if (pricesRes && pricesRes.ok) {
        const pricesData = await pricesRes.json();
        setPrices({
          '48x48': pricesData['48x48'] ?? 39.99,
          '75x75': pricesData['75x75'] ?? 49.99,
          '96x96': pricesData['96x96'] ?? 59.99,
          stand: pricesData.stand ?? 10.00,
          wall_mounting_dots: pricesData.wall_mounting_dots ?? 5.99,
        });
      }
      if (contentRes && contentRes.ok) {
        const contentData = await contentRes.json();
        setContent({
          title: contentData.title ?? '3D Album Cover Mosaic Builder',
          price_subtitle: contentData.price_subtitle ?? 'Create colorized 3D prints',
          upload_image_text: contentData.upload_image_text ?? 'Choose image file...',
          upload_subtext: contentData.upload_subtext ?? 'Will be resized to 75×75 pixels',
        });
      }
    } catch (error) {
      // Silently fail - these endpoints are optional
    }
  };

  const loadOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const response = await fetch(`${BACKEND_URL}/admin/orders`);
      if (response.ok) {
        const ordersData = await response.json();
        setOrders(ordersData);
      } else {
        setStatusMessage({ type: 'error', text: 'Failed to load orders' });
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      setStatusMessage({ type: 'error', text: 'Error loading orders' });
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const saveAll = async () => {
    try {
      const [pricesRes, contentRes] = await Promise.all([
        fetch(`${BACKEND_URL}/admin/prices/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prices),
        }).catch(() => ({ ok: false })),
        fetch(`${BACKEND_URL}/admin/content/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(content),
        }).catch(() => ({ ok: false })),
      ]);

      if (pricesRes.ok && contentRes.ok) {
        setStatusMessage({ type: 'success', text: 'All changes saved successfully!' });
      } else {
        setStatusMessage({ type: 'error', text: 'Save endpoints not yet implemented. Changes are only local.' });
      }
    } catch (error) {
      setStatusMessage({ type: 'error', text: `Error saving: ${error}` });
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FFFBF5' }}>
      <div style={{ background: '#2d5016', color: 'white', padding: '15px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', marginBottom: '10px' }}>Admin Panel</h1>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={() => setActiveTab('edit')}
            style={{
              padding: '8px 20px',
              background: activeTab === 'edit' ? 'white' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'edit' ? '#2d5016' : 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
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
            Orders
          </button>
          <button
            onClick={() => setActiveTab('converter')}
            style={{
              padding: '8px 20px',
              background: activeTab === 'converter' ? 'white' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'converter' ? '#2d5016' : 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            PLY to OBJ
          </button>
          <button
            onClick={() => setActiveTab('objRepair')}
            style={{
              padding: '8px 20px',
              background: activeTab === 'objRepair' ? 'white' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'objRepair' ? '#2d5016' : 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            OBJ Repair
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

        {activeTab === 'edit' && (
          <Layout>
            <Layout.Section>
              <Card>
                <div style={{ padding: '20px' }}>
                  <h2 style={{ fontSize: '32px', color: '#E87D3E', marginBottom: '20px' }}>
                    {content.title}
                  </h2>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Title:</label>
                    <input
                      type="text"
                      value={content.title ?? ''}
                      onChange={(e) => setContent({ ...content, title: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Price Subtitle:</label>
                    <input
                      type="text"
                      value={content.price_subtitle ?? ''}
                      onChange={(e) => setContent({ ...content, price_subtitle: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Upload Text:</label>
                    <input
                      type="text"
                      value={content.upload_image_text ?? ''}
                      onChange={(e) => setContent({ ...content, upload_image_text: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Upload Subtext:</label>
                    <input
                      type="text"
                      value={content.upload_subtext ?? ''}
                      onChange={(e) => setContent({ ...content, upload_subtext: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                </div>
              </Card>

              <div style={{ marginTop: '20px' }}>
                <Card>
                  <div style={{ padding: '20px' }}>
                    <h3 style={{ marginBottom: '15px' }}>Prices</h3>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>48×48:</label>
                    <input
                      type="number"
                      step="0.01"
                      value={prices['48x48'] ?? ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setPrices({ ...prices, '48x48': isNaN(val) ? 0 : val });
                      }}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>75×75:</label>
                    <input
                      type="number"
                      step="0.01"
                      value={prices['75x75'] ?? ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setPrices({ ...prices, '75x75': isNaN(val) ? 0 : val });
                      }}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>96×96:</label>
                    <input
                      type="number"
                      step="0.01"
                      value={prices['96x96'] ?? ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setPrices({ ...prices, '96x96': isNaN(val) ? 0 : val });
                      }}
                      style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                  </div>
                  </div>
                </Card>
              </div>
            </Layout.Section>
          </Layout>
        )}

        {activeTab === 'orders' && (
          <Card>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Orders</h2>
                <Button onClick={loadOrders} disabled={isLoadingOrders}>
                  {isLoadingOrders ? 'Loading...' : 'Refresh'}
                </Button>
              </div>
              
              {isLoadingOrders ? (
                <p>Loading orders...</p>
              ) : orders.length === 0 ? (
                <p>No orders found.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #ddd', background: '#f5f5f5' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Order ID</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Date & Time</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Customer Name</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Price</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>Size</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold' }}>OBJ File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => {
                        const completedDate = new Date(order.completedAt);
                        const formattedDate = completedDate.toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        
                        return (
                          <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '12px' }}>
                              {order.shopifyOrderName || order.orderId}
                            </td>
                            <td style={{ padding: '12px' }}>{formattedDate}</td>
                            <td style={{ padding: '12px' }}>{order.customerName}</td>
                            <td style={{ padding: '12px' }}>${order.price.toFixed(2)}</td>
                            <td style={{ padding: '12px' }}>{order.gridSize}×{order.gridSize}</td>
                            <td style={{ padding: '12px' }}>
                              {order.objUrl ? (
                                <a
                                  href={order.objUrl}
                                  download
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

        {activeTab === 'converter' && (
          <Card>
            <div style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>PLY to OBJ Converter</h2>
              <p style={{ marginBottom: '20px', color: '#666' }}>
                Upload a PLY file to convert it to OBJ format. All colors will be preserved perfectly.
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
                  Select PLY File:
                </label>
                <input
                  key={fileInputKey}
                  type="file"
                  accept=".ply"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setPlyFile(file);
                      setStatusMessage(null);
                    } else {
                      setPlyFile(null);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '2px dashed #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                />
                {plyFile && (
                  <p style={{ marginTop: '10px', color: '#666' }}>
                    Selected: {plyFile.name} ({(plyFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              <Button
                variant="primary"
                onClick={async () => {
                  if (!plyFile) {
                    setStatusMessage({ type: 'error', text: 'Please select a PLY file first' });
                    return;
                  }

                  setIsConverting(true);
                  setStatusMessage(null);

                  try {
                    const formData = new FormData();
                    formData.append('plyFile', plyFile);

                    const response = await fetch(`${BACKEND_URL}/admin/ply-to-obj`, {
                      method: 'POST',
                      body: formData,
                    });

                    if (!response.ok) {
                      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                      throw new Error(errorData.message || errorData.error || 'Conversion failed');
                    }

                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = plyFile.name.replace('.ply', '.obj');
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);

                    setStatusMessage({
                      type: 'success',
                      text: 'Conversion successful! OBJ file downloaded.',
                    });
                    setPlyFile(null);
                    setFileInputKey(prev => prev + 1);
                  } catch (error) {
                    console.error('Conversion error:', error);
                    setStatusMessage({
                      type: 'error',
                      text: error instanceof Error ? error.message : 'Failed to convert PLY to OBJ',
                    });
                  } finally {
                    setIsConverting(false);
                  }
                }}
                disabled={!plyFile || isConverting}
                loading={isConverting}
              >
                {isConverting ? 'Converting...' : 'Convert to OBJ'}
              </Button>
            </div>
          </Card>
        )}

        {activeTab === 'objRepair' && (
          <Card>
            <div style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '24px', marginBottom: '20px' }}>OBJ Repair Tool</h2>
              <p style={{ marginBottom: '20px', color: '#666' }}>
                Upload an OBJ file to repair it. This will fix non-manifold edges, fill hollow bottom cubes, 
                and ensure the mesh is solid and ready for 3D printing.
              </p>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
                  Select OBJ File:
                </label>
                <input
                  key={`obj-${fileInputKey}`}
                  type="file"
                  accept=".obj"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setObjFile(file);
                      setStatusMessage(null);
                    } else {
                      setObjFile(null);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '2px dashed #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                />
                {objFile && (
                  <p style={{ marginTop: '10px', color: '#666' }}>
                    Selected: {objFile.name} ({(objFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              <Button
                variant="primary"
                onClick={async () => {
                  if (!objFile) {
                    setStatusMessage({ type: 'error', text: 'Please select an OBJ file first' });
                    return;
                  }

                  setIsRepairing(true);
                  setStatusMessage(null);

                  try {
                    const formData = new FormData();
                    formData.append('objFile', objFile);

                    const response = await fetch(`${BACKEND_URL}/admin/obj-repair`, {
                      method: 'POST',
                      body: formData,
                    });

                    if (!response.ok) {
                      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                      throw new Error(errorData.message || errorData.error || 'Repair failed');
                    }

                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = objFile.name.replace('.obj', '-repaired.obj');
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);

                    setStatusMessage({
                      type: 'success',
                      text: 'Repair successful! Repaired OBJ file downloaded.',
                    });
                    setObjFile(null);
                    setFileInputKey(prev => prev + 1);
                  } catch (error) {
                    console.error('Repair error:', error);
                    setStatusMessage({
                      type: 'error',
                      text: error instanceof Error ? error.message : 'Failed to repair OBJ file',
                    });
                  } finally {
                    setIsRepairing(false);
                  }
                }}
                disabled={!objFile || isRepairing}
                loading={isRepairing}
              >
                {isRepairing ? 'Repairing...' : 'Repair OBJ File'}
              </Button>
            </div>
          </Card>
        )}

        <div style={{ position: 'fixed', bottom: '20px', right: '20px' }}>
          <Button variant="primary" onClick={saveAll}>
            Save All
          </Button>
        </div>
      </div>
    </div>
  );
}

