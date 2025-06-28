const mongoose = require('mongoose');
const cacheService = require('./cacheService');

class QueryOptimizer {
  constructor() {
    this.indexSuggestions = new Map();
    this.slowQueryThreshold = 100; // ms
    this.queryStats = new Map();
  }

  // Monitor query performance
  async monitorQuery(model, operation, query, options = {}) {
    const startTime = Date.now();
    const queryKey = `${model.modelName}:${operation}:${JSON.stringify(query)}`;
    
    try {
      // Check if we can use cache
      if (operation === 'find' || operation === 'findOne') {
        const cacheKey = cacheService.generateKey(model.modelName.toLowerCase(), queryKey);
        const cached = await cacheService.get(cacheKey);
        
        if (cached) {
          return cached;
        }
      }
      
      // Execute query with explain
      let result;
      const explainData = await model[operation](query).explain('executionStats');
      
      // Execute actual query
      if (operation === 'find') {
        result = await model.find(query, options.projection)
          .sort(options.sort || {})
          .limit(options.limit || 0)
          .skip(options.skip || 0)
          .lean();
      } else if (operation === 'findOne') {
        result = await model.findOne(query, options.projection).lean();
      } else if (operation === 'aggregate') {
        result = await model.aggregate(query);
      }
      
      const duration = Date.now() - startTime;
      
      // Track query statistics
      this.trackQueryStats(queryKey, duration, explainData);
      
      // Analyze for optimization opportunities
      if (duration > this.slowQueryThreshold) {
        this.analyzeSlow Query(model, operation, query, explainData, duration);
      }
      
      // Cache the result
      if (result && (operation === 'find' || operation === 'findOne')) {
        const cacheKey = cacheService.generateKey(model.modelName.toLowerCase(), queryKey);
        await cacheService.set(cacheKey, result, options.cacheTTL || 300);
      }
      
      return result;
    } catch (error) {
      console.error('Query optimization error:', error);
      throw error;
    }
  }

  // Track query statistics
  trackQueryStats(queryKey, duration, explainData) {
    if (!this.queryStats.has(queryKey)) {
      this.queryStats.set(queryKey, {
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        maxDuration: 0,
        minDuration: Infinity,
        lastExplain: null,
      });
    }
    
    const stats = this.queryStats.get(queryKey);
    stats.count++;
    stats.totalDuration += duration;
    stats.avgDuration = stats.totalDuration / stats.count;
    stats.maxDuration = Math.max(stats.maxDuration, duration);
    stats.minDuration = Math.min(stats.minDuration, duration);
    stats.lastExplain = explainData;
  }

  // Analyze slow queries
  analyzeSlowQuery(model, operation, query, explainData, duration) {
    console.warn(`Slow query detected: ${model.modelName}.${operation}`);
    console.warn(`Duration: ${duration}ms`);
    console.warn(`Query:`, query);
    
    const executionStats = explainData.executionStats;
    
    // Check if index was used
    if (executionStats.totalDocsExamined > executionStats.totalKeysExamined * 2) {
      this.suggestIndex(model, query, executionStats);
    }
    
    // Check for collection scan
    if (executionStats.executionStages.stage === 'COLLSCAN') {
      console.warn('⚠️  Collection scan detected! Consider adding an index.');
    }
  }

  // Suggest indexes based on query patterns
  suggestIndex(model, query, executionStats) {
    const fields = Object.keys(query);
    const suggestion = {
      model: model.modelName,
      fields: fields,
      reason: 'Frequent query pattern with poor performance',
      stats: {
        docsExamined: executionStats.totalDocsExamined,
        keysExamined: executionStats.totalKeysExamined,
        executionTimeMs: executionStats.executionTimeMillis,
      },
    };
    
    const key = `${model.modelName}:${fields.join(',')}`;
    this.indexSuggestions.set(key, suggestion);
  }

  // Create optimized aggregation pipelines
  createOptimizedPipeline(stages) {
    const optimized = [];
    
    // Move $match stages as early as possible
    const matchStages = stages.filter(stage => stage.$match);
    const otherStages = stages.filter(stage => !stage.$match);
    
    optimized.push(...matchStages);
    
    // Add $project early to reduce document size
    const hasProject = stages.some(stage => stage.$project);
    if (!hasProject && otherStages.some(stage => stage.$group || stage.$sort)) {
      // Add a projection stage to include only necessary fields
      optimized.push({
        $project: {
          _id: 1,
          // Add other necessary fields based on the pipeline
        },
      });
    }
    
    optimized.push(...otherStages);
    
    return optimized;
  }

  // Batch operations for better performance
  async batchOperation(model, operations) {
    const bulkOps = [];
    
    for (const op of operations) {
      switch (op.type) {
        case 'insert':
          bulkOps.push({ insertOne: { document: op.document } });
          break;
        case 'update':
          bulkOps.push({
            updateOne: {
              filter: op.filter,
              update: op.update,
              upsert: op.upsert || false,
            },
          });
          break;
        case 'delete':
          bulkOps.push({ deleteOne: { filter: op.filter } });
          break;
      }
    }
    
    if (bulkOps.length === 0) return { ok: 1, writeErrors: [] };
    
    return await model.bulkWrite(bulkOps, { ordered: false });
  }

  // Create database indexes
  async createIndexes(model, indexes) {
    const results = [];
    
    for (const index of indexes) {
      try {
        const result = await model.collection.createIndex(index.fields, index.options || {});
        results.push({ success: true, index: result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    
    return results;
  }

  // Optimize find queries with cursor
  createOptimizedCursor(model, query, options = {}) {
    const cursor = model.find(query);
    
    // Apply optimizations
    if (options.projection) {
      cursor.select(options.projection);
    }
    
    if (options.sort) {
      cursor.sort(options.sort);
    }
    
    if (options.limit) {
      cursor.limit(options.limit);
    }
    
    if (options.skip) {
      cursor.skip(options.skip);
    }
    
    // Use lean for better performance
    cursor.lean();
    
    // Add read preference for replica sets
    if (options.readPreference) {
      cursor.read(options.readPreference);
    }
    
    return cursor;
  }

  // Connection pool optimization
  optimizeConnectionPool() {
    const currentOptions = mongoose.connection.options;
    
    return {
      maxPoolSize: process.env.NODE_ENV === 'production' ? 100 : 10,
      minPoolSize: process.env.NODE_ENV === 'production' ? 10 : 2,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      maxIdleTimeMS: 60000,
      waitQueueTimeoutMS: 10000,
    };
  }

  // Get optimization report
  getOptimizationReport() {
    const slowQueries = Array.from(this.queryStats.entries())
      .filter(([_, stats]) => stats.avgDuration > this.slowQueryThreshold)
      .map(([query, stats]) => ({ query, ...stats }))
      .sort((a, b) => b.avgDuration - a.avgDuration);
    
    const indexSuggestions = Array.from(this.indexSuggestions.values());
    
    return {
      slowQueries: slowQueries.slice(0, 10),
      indexSuggestions,
      totalQueries: this.queryStats.size,
      recommendations: this.generateRecommendations(slowQueries, indexSuggestions),
    };
  }

  generateRecommendations(slowQueries, indexSuggestions) {
    const recommendations = [];
    
    if (slowQueries.length > 0) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: `${slowQueries.length} slow queries detected. Consider optimization.`,
      });
    }
    
    if (indexSuggestions.length > 0) {
      recommendations.push({
        type: 'index',
        priority: 'medium',
        message: `${indexSuggestions.length} index suggestions available.`,
        suggestions: indexSuggestions,
      });
    }
    
    return recommendations;
  }

  // Reset statistics
  resetStats() {
    this.queryStats.clear();
    this.indexSuggestions.clear();
  }
}

module.exports = new QueryOptimizer();