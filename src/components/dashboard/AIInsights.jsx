/**
 * AIInsights.jsx
 *
 * Premium AI-powered business intelligence dashboard.
 * Calls Cloud Function → Gemini → renders structured insights.
 * Zero direct Gemini calls from frontend (API key stays server-side).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocument } from '../../hooks/useFirestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';
import {
  Sparkles, TrendingUp, TrendingDown, Package, Clock,
  RefreshCw, ChevronDown, ChevronUp, Zap, Target,
  MessageSquare, BarChart2, ShoppingBag, AlertTriangle,
  CheckCircle2, ArrowRight, Star, Lock,
} from 'lucide-react';

// ─── constants ────────────────────────────────────────────────────────────────

const HEALTH_CONFIG = {
  excellent:      { color: '#10B981', label: 'Excellent',      icon: '🌟' },
  good:           { color: '#D4AF37', label: 'Good',           icon: '✅' },
  average:        { color: '#F59E0B', label: 'Average',        icon: '📊' },
  needs_attention:{ color: '#EF4444', label: 'Needs Attention',icon: '⚠️' },
};

const CARD_VARIANTS = {
  hidden:  { opacity: 0, y: 24 },
  visible: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

// ─── sub-components ───────────────────────────────────────────────────────────

const SectionCard = ({ title, icon: Icon, children, delay = 0, accent = '#D4AF37', T }) => (
  <motion.div
    custom={delay}
    variants={CARD_VARIANTS}
    initial="hidden"
    animate="visible"
    className={`${T.card} rounded-xl overflow-hidden`}
  >
    <div className={`flex items-center gap-3 px-5 py-4 border-b ${T.border}`}
      style={{ background: `linear-gradient(135deg, ${accent}08, transparent)` }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: `${accent}20` }}>
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <h3 className={`${T.heading} font-semibold text-sm`} style={{ fontFamily: 'Playfair Display, serif' }}>
        {title}
      </h3>
    </div>
    <div className="p-5">{children}</div>
  </motion.div>
);

const InsightBullet = ({ text, color = '#D4AF37', T }) => (
  <div className="flex items-start gap-2.5 py-1.5">
    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: color }} />
    <p className="text-[#D1D1D1] text-sm leading-relaxed">{text}</p>
  </div>
);

const StatPill = ({ label, value, color, T }) => (
  <div className={`flex items-center justify-between py-2 border-b ${T.border} last:border-0`}>
    <span className={`${T.muted} text-sm`}>{label}</span>
    <span className="font-semibold text-sm" style={{ color }}>{value}</span>
  </div>
);

const ActionItem = ({ text, index, T }) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: index * 0.05 }}
    className={`flex items-start gap-3 p-3 bg-white/3 rounded-lg hover:${T.subCard} transition-colors`}
  >
    <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
      <span className="text-[#D4AF37] text-xs font-bold">{index + 1}</span>
    </div>
    <p className="text-[#D1D1D1] text-sm leading-relaxed">{text}</p>
  </motion.div>
);

// ─── Skeleton loader ──────────────────────────────────────────────────────────

const InsightSkeleton = ({ T }) => (
  <div className="space-y-4">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className={`${T.card} rounded-xl p-5 animate-pulse`}>
        <div className={`h-4 ${T.subCard} rounded w-1/3 mb-4`} />
        <div className="space-y-2">
          <div className={`h-3 ${T.subCard} rounded w-full`} />
          <div className={`h-3 ${T.subCard} rounded w-5/6`} />
          <div className={`h-3 ${T.subCard} rounded w-4/6`} />
        </div>
      </div>
    ))}
  </div>
);

// ─── Locked state ─────────────────────────────────────────────────────────────

const LockedState = ({ T }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-20 text-center"
  >
    <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center mb-4">
      <Lock className="w-8 h-8 text-[#D4AF37]" />
    </div>
    <h3 className={`${T.heading} text-xl font-bold mb-2`} style={{ fontFamily: 'Playfair Display, serif' }}>
      AI Insights Locked
    </h3>
    <p className={`${T.muted} text-sm max-w-xs leading-relaxed`}>
      AI Insights is not enabled for your café. Contact your administrator to activate this feature.
    </p>
  </motion.div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const AIInsights = () => {
  const { user } = useAuth();
  const cafeId   = user?.cafeId;
  const { data: cafe } = useDocument('cafes', cafeId);
  const { T, isLight } = useTheme();

  const [insights,   setInsights  ] = useState(null);
  const [analytics,  setAnalytics ] = useState(null);
  const [loading,    setLoading   ] = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [dateRange,  setDateRange ] = useState(7);
  const [expanded,   setExpanded  ] = useState({ marketing: false });

  const isEnabled = cafe?.features?.aiInsights;

  // Load cached insights on mount
  useEffect(() => {
    if (!cafeId || !isEnabled) return;
    loadCached();
  }, [cafeId, isEnabled]);

  const loadCached = async () => {
    try {
      const fns      = getFunctions();
      const getCached = httpsCallable(fns, 'getCachedInsights');
      const result   = await getCached({ cafeId });
      if (result.data?.cached) {
        setInsights(result.data.insights);
        setAnalytics(result.data.analyticsSnapshot);
        setGeneratedAt(result.data.generatedAt);
      }
    } catch { /* silently skip — will just show generate button */ }
  };

  const handleGenerate = useCallback(async () => {
    if (!cafeId || loading) return;
    setLoading(true);
    try {
      const fns      = getFunctions();
      const generate = httpsCallable(fns, 'generateAIInsights');
      const result   = await generate({ cafeId, dateRange });

      if (result.data?.success) {
        setInsights(result.data.insights);
        setAnalytics(result.data.analyticsSnapshot);
        setGeneratedAt(new Date().toISOString());
        toast.success('AI Insights generated ✨');
      }
    } catch (err) {
      const msg = err.message || 'Failed to generate insights';
      if (msg.includes('not configured')) {
        toast.error('Gemini API key not set — configure in Admin Panel');
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [cafeId, dateRange, loading]);

  if (!isEnabled) return <LockedState T={T} />;

  const health = insights ? HEALTH_CONFIG[insights.summary?.overallHealth] || HEALTH_CONFIG.good : null;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37]/20 to-purple-500/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#D4AF37]" />
          </div>
          <div>
            <h2 className={`${T.heading} font-bold text-xl`} style={{ fontFamily: 'Playfair Display, serif' }}>
              AI Business Insights
            </h2>
            {generatedAt && (
              <p className={`${T.faint} text-xs`}>
                Generated {new Date(generatedAt).toLocaleString('en-IN')} · cached 1h
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={dateRange}
            onChange={e => setDateRange(Number(e.target.value))}
            className={`${T.innerCard} border ${T.borderMd} ${T.body} text-sm rounded-sm px-3 h-9 focus:border-[#D4AF37] transition-all`}
          >
            <option value={7}  className={T.option}>Last 7 days</option>
            <option value={14} className={T.option}>Last 14 days</option>
            <option value={30} className={T.option}>Last 30 days</option>
          </select>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-[#D4AF37] to-[#B8962E] text-black font-bold rounded-sm text-sm transition-all disabled:opacity-60"
          >
            {loading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analysing…</>
              : <><Sparkles className="w-4 h-4" /> {insights ? 'Refresh' : 'Generate Insights'}</>
            }
          </motion.button>
        </div>
      </div>

      {/* Loading */}
      {loading && <InsightSkeleton T={T}  />}

      {/* Empty */}
      {!loading && !insights && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`${T.card} rounded-xl p-12 text-center`}
        >
          <Sparkles className="w-12 h-12 text-[#D4AF37]/30 mx-auto mb-4" />
          <h3 className={`${T.heading} font-semibold mb-2`}>No insights yet</h3>
          <p className={`${T.muted} text-sm mb-6`}>
            Click "Generate Insights" to get a comprehensive AI analysis of your café's performance.
          </p>
          <button
            onClick={handleGenerate}
            className="px-6 py-2.5 bg-[#D4AF37] text-black font-bold rounded-sm text-sm"
          >
            Generate Now
          </button>
        </motion.div>
      )}

      {/* Insights Grid */}
      {!loading && insights && (
        <div className="space-y-4">

          {/* Health Score Banner */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            style={{
              background: `linear-gradient(135deg, ${health.color}12, transparent)`,
              borderColor: `${health.color}30`,
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-4xl">{health.icon}</span>
              <div>
                <p className={`${T.heading} font-bold text-lg`} style={{ fontFamily: 'Playfair Display, serif' }}>
                  {insights.summary?.headline}
                </p>
                <p className={`${T.muted} text-sm mt-0.5`}>
                  Overall Health: <span style={{ color: health.color }} className="font-semibold">{health.label}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-4xl font-black" style={{ color: health.color }}>
                {insights.summary?.healthScore}
              </span>
              <span className={`${T.muted} text-xs`}>/ 100</span>
            </div>
          </motion.div>

          {/* Stats snapshot */}
          {analytics && (
            <motion.div
              custom={0} variants={CARD_VARIANTS} initial="hidden" animate="visible"
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {[
                { label: 'Total Revenue', value: `${analytics.cafe?.currency}${analytics.revenue?.total}`, color: '#10B981' },
                { label: 'Total Orders',  value: analytics.orders?.total,        color: '#D4AF37' },
                { label: 'Avg Order',     value: `${analytics.cafe?.currency}${analytics.revenue?.avgOrderValue}`, color: '#3B82F6' },
                { label: 'Menu Items',    value: analytics.menuItemCount,        color: '#8B5CF6' },
              ].map((stat, i) => (
                <div key={i} className={`${T.card} rounded-xl p-4 text-center`}>
                  <p className="text-2xl font-black" style={{ color: stat.color }}>{stat.value}</p>
                  <p className={`${T.muted} text-xs mt-1`}>{stat.label}</p>
                </div>
              ))}
            </motion.div>
          )}

          {/* Revenue Analysis */}
          <SectionCard T={T} title="Revenue Analysis" icon={TrendingUp} delay={1} accent="#10B981">
            <p className="text-[#D1D1D1] text-sm leading-relaxed mb-4">
              {insights.revenue?.analysis}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white/3 rounded-lg p-3">
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-1`}>Trend</p>
                <p className={`${T.heading} font-semibold capitalize`}>{insights.revenue?.trend}</p>
              </div>
              <div className="bg-white/3 rounded-lg p-3">
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-1`}>Profit Est.</p>
                <p className={`${T.heading} font-semibold text-sm`}>{insights.revenue?.profitEstimation}</p>
              </div>
              <div className="bg-white/3 rounded-lg p-3">
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-1`}>Next Week Target</p>
                <p className="text-[#10B981] font-bold">{insights.revenue?.targetNextWeek}</p>
              </div>
            </div>
          </SectionCard>

          {/* Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard T={T} title="Star Performers" icon={Star} delay={2} accent="#D4AF37">
              {(insights.products?.stars || []).map((item, i) => (
                <InsightBullet T={T} key={i} text={item} color="#D4AF37" />
              ))}
              {(insights.products?.comboSuggestions || []).length > 0 && (
                <>
                  <p className={`${T.muted} text-xs uppercase tracking-wide mt-4 mb-2`}>Combo Ideas</p>
                  {insights.products.comboSuggestions.map((c, i) => (
                    <InsightBullet T={T} key={i} text={c} color="#10B981" />
                  ))}
                </>
              )}
            </SectionCard>

            <SectionCard T={T} title="Product Strategy" icon={Target} delay={3} accent="#3B82F6">
              {(insights.products?.pricingOpportunities || []).length > 0 && (
                <>
                  <p className={`${T.muted} text-xs uppercase tracking-wide mb-2`}>Pricing Opportunities</p>
                  {insights.products.pricingOpportunities.map((p, i) => (
                    <InsightBullet T={T} key={i} text={p} color="#3B82F6" />
                  ))}
                </>
              )}
              {(insights.products?.toPromote || []).length > 0 && (
                <>
                  <p className={`${T.muted} text-xs uppercase tracking-wide mt-4 mb-2`}>Push These Items</p>
                  {insights.products.toPromote.map((p, i) => (
                    <InsightBullet T={T} key={i} text={p} color="#F59E0B" />
                  ))}
                </>
              )}
            </SectionCard>
          </div>

          {/* Operations */}
          <SectionCard T={T} title="Operations & Staffing" icon={Clock} delay={4} accent="#8B5CF6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/3 rounded-lg p-4">
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-2`}>⚡ Peak Hours</p>
                <p className="text-[#D1D1D1] text-sm leading-relaxed">{insights.operations?.peakHourStrategy}</p>
              </div>
              <div className="bg-white/3 rounded-lg p-4">
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-2`}>😴 Off-Peak</p>
                <p className="text-[#D1D1D1] text-sm leading-relaxed">{insights.operations?.offPeakStrategy}</p>
              </div>
              <div className="bg-white/3 rounded-lg p-4">
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-2`}>📦 Inventory</p>
                <p className="text-[#D1D1D1] text-sm leading-relaxed">{insights.operations?.inventoryAlert}</p>
              </div>
              <div className="bg-white/3 rounded-lg p-4">
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-2`}>👥 Staffing</p>
                <p className="text-[#D1D1D1] text-sm leading-relaxed">{insights.operations?.staffingHint}</p>
              </div>
            </div>
          </SectionCard>

          {/* Growth */}
          <SectionCard T={T} title="Growth Strategies" icon={Zap} delay={5} accent="#F59E0B">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-3`}>Upsell Tactics</p>
                {(insights.growth?.upsellStrategies || []).map((s, i) => (
                  <InsightBullet T={T} key={i} text={s} color="#F59E0B" />
                ))}
              </div>
              <div>
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-3`}>Time-Based Offers</p>
                {(insights.growth?.timeBasedOffers || []).map((o, i) => (
                  <InsightBullet T={T} key={i} text={o} color="#10B981" />
                ))}
              </div>
            </div>
            {insights.growth?.externalPlatformStrategy && (
              <div className="mt-4 p-4 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                <p className={`${T.muted} text-xs uppercase tracking-wide mb-1`}>🟠 Zomato / Swiggy</p>
                <p className="text-[#D1D1D1] text-sm">{insights.growth.externalPlatformStrategy}</p>
              </div>
            )}
          </SectionCard>

          {/* WhatsApp Marketing Message */}
          <SectionCard T={T} title="WhatsApp Marketing Message" icon={MessageSquare} delay={6} accent="#25D366">
            <div
              className="cursor-pointer"
              onClick={() => setExpanded(e => ({ ...e, marketing: !e.marketing }))}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-green-500/10 border border-green-500/20 text-green-400 px-2 py-0.5 rounded font-medium">
                    Ready to Send
                  </span>
                  <span className={`text-xs ${T.faint}`}>{insights.marketing?.topOffer}</span>
                </div>
                {expanded.marketing ? <ChevronUp className={`w-4 h-4 ${T.muted}`} /> : <ChevronDown className={`w-4 h-4 ${T.muted}`} />}
              </div>
              <AnimatePresence>
                {expanded.marketing && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    <pre className={`text-[#D1D1D1] text-sm leading-relaxed whitespace-pre-wrap font-sans bg-white/3 rounded-lg p-4 border ${T.border}`}>
                      {insights.marketing?.whatsappMessage}
                    </pre>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(insights.marketing?.whatsappMessage || '');
                        toast.success('Message copied to clipboard!');
                      }}
                      className={`mt-3 flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 ${T.heading} font-semibold rounded-sm text-sm transition-all`}
                    >
                      📋 Copy Message
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              {!expanded.marketing && (
                <p className={`${T.faint} text-sm truncate`}>
                  {insights.marketing?.whatsappMessage?.slice(0, 80)}…
                </p>
              )}
            </div>
          </SectionCard>

          {/* Action Plan */}
          <SectionCard T={T} title="Your Action Plan" icon={CheckCircle2} delay={7} accent="#10B981">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {[
                { label: '🎯 Today', items: insights.actionPlan?.today,     color: '#EF4444' },
                { label: '📅 This Week', items: insights.actionPlan?.thisWeek, color: '#D4AF37' },
                { label: '🚀 This Month', items: insights.actionPlan?.thisMonth, color: '#10B981' },
              ].map(({ label, items, color }) => (
                <div key={label}>
                  <p className="text-xs font-bold mb-3" style={{ color }}>{label}</p>
                  <div className="space-y-2">
                    {(items || []).map((item, i) => (
                      <ActionItem T={T} key={i} text={item} index={i} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

        </div>
      )}
    </div>
  );
};

export default AIInsights;
